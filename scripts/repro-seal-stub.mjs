// End-to-end MCP check for the S7.2 fix without touching the real platform:
// stands up a local stub of POST /api/v1/issue, then drives dist/server.js
// over stdio JSON-RPC exactly as the deepadata-com S7 smoke does. Asserts
// the artifact arrives at the endpoint verbatim and the envelope comes
// back through the tool untouched. No registry write, no billing.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert';

const fixture = resolve('tests', 'fixtures', 'platform-artifact-0.8-full.json');
const artifact = JSON.parse(readFileSync(fixture, 'utf8'));

const cannedEnvelope = {
  payload_type: 'edm.v0.8.0',
  payload: artifact,
  ddna_header: { payload_type: 'edm.v0.8.0' },
  proof: { type: 'DataIntegrityProof', cryptosuite: 'eddsa-jcs-2022', proofValue: 'z-stub' },
};

let receivedBody = null;
const stub = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    receivedBody = JSON.parse(raw);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: {
        envelope: cannedEnvelope,
        certificate_id: 'cert-stub-1',
        certification_level: 'standard',
        issuance: {
          pathway: receivedBody.pathway,
          authority: receivedBody.authority,
          timestamp: '2026-07-22T00:00:00Z',
          issuer_did: 'did:key:zstub',
        },
      },
    }));
  });
});
await new Promise((r) => stub.listen(0, '127.0.0.1', r));
const port = stub.address().port;

const child = spawn(process.execPath, [resolve('dist', 'server.js')], {
  env: {
    ...process.env,
    DEEPADATA_API_URL: `http://127.0.0.1:${port}`,
    DEEPADATA_API_KEY: 'dd_stub_key',
  },
  stdio: ['pipe', 'pipe', 'inherit'],
});

let buffer = '';
let nextId = 1;
const pending = new Map();
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString('utf8');
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    } catch { /* ignore */ }
  }
});

function request(method, params) {
  return new Promise((resolveP, rejectP) => {
    const id = nextId++;
    const timer = setTimeout(() => rejectP(new Error(`timeout: ${method}`)), 30_000);
    pending.set(id, (v) => { clearTimeout(timer); resolveP(v); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

try {
  await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'repro-stub', version: '0.0.1' },
  });
  const res = await request('tools/call', {
    name: 'seal_artifact',
    arguments: { artifact },
  });

  assert.strictEqual(res.error, undefined, `tool errored: ${JSON.stringify(res.error)}`);
  const content = res.result?.content?.[0]?.text ?? JSON.stringify(res.result);
  const parsed = JSON.parse(content);

  assert.deepStrictEqual(receivedBody.artifact, artifact, 'artifact NOT forwarded verbatim');
  assert.strictEqual(receivedBody.pathway, 'delegated');
  assert.strictEqual(receivedBody.authority, 'mcp:edm-server');
  assert.strictEqual(receivedBody.source, 'mcp');

  const envelope = parsed.envelope ?? parsed;
  assert.deepStrictEqual(envelope, cannedEnvelope, 'envelope NOT returned verbatim');

  console.log('PASS: seal_artifact accepts the S7 platform artifact,');
  console.log('      forwards it verbatim to /api/v1/issue, and returns the');
  console.log('      platform envelope untouched.');
  console.log(`      certificate_id=${parsed.certificate_id} level=${parsed.certification_level}`);
} finally {
  child.kill();
  stub.close();
}
