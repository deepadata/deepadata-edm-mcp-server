// Reproduce S7.2 seal_artifact failure: drive dist/server.js over stdio
// JSON-RPC exactly as deepadata-com scripts/smoke/s7-mcp.mts does, with the
// same platform-spec fixture artifact (out/smoke/artifact-full.json).
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixture = process.argv[2] ??
  resolve(process.cwd(), '..', 'deepadata-com', 'out', 'smoke', 'artifact-full.json');
const artifact = JSON.parse(readFileSync(fixture, 'utf8'));

const child = spawn(process.execPath, [resolve('dist', 'server.js')], {
  env: {
    ...process.env,
    DEEPADATA_API_URL: process.env.DEEPADATA_API_URL ?? 'http://localhost:3000',
    DEEPADATA_API_KEY: process.env.DEEPADATA_API_KEY ?? 'dd_repro_dummy_key',
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
      if (pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
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
    clientInfo: { name: 'repro', version: '0.0.1' },
  });
  const res = await request('tools/call', {
    name: 'seal_artifact',
    arguments: { artifact },
  });
  console.log('--- seal_artifact response ---');
  console.log(JSON.stringify(res, null, 2));
} finally {
  child.kill();
}
