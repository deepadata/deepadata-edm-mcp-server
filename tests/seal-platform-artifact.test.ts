/**
 * Regression tests for the S7.2 smoke defect: seal_artifact rejected
 * platform-spec 0.8.x artifacts with "Artifact must have an artifact_id".
 *
 * The seal tool is a thin adapter over POST /api/v1/issue. Its pre-flight
 * must mirror what the sealing authority (platform lib/ddna seal()) accepts:
 * the EDM spec shape — meta + core domains, meta.version — with NO legacy
 * top-level artifact_id, and the artifact must be forwarded verbatim (the
 * three-way interop matrix depends on the platform sealing exactly the
 * bytes the caller supplied).
 *
 * Fixture: tests/fixtures/platform-artifact-0.8-full.json is the exact
 * artifact the deepadata-com S7 smoke fed to this tool (a real
 * /api/v1/extract full-profile output).
 */

import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SealToolHandler, SealErrorCode } from '../src/tools/seal.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const platformArtifact = (): Record<string, unknown> =>
  JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'platform-artifact-0.8-full.json'), 'utf8')
  );

/** lib/ddna-shaped envelope as the platform returns it (trimmed). */
const cannedEnvelope = {
  payload_type: 'edm.v0.8.0',
  payload: { meta: { id: 'x' } },
  ddna_header: { payload_type: 'edm.v0.8.0' },
  proof: {
    type: 'DataIntegrityProof',
    cryptosuite: 'eddsa-jcs-2022',
    proofValue: 'z-test',
  },
};

type FetchFn = (url: string, init?: RequestInit) => Promise<unknown>;

describe('SealToolHandler — platform-spec artifacts (S7.2 regression)', () => {
  let fetchMock: jest.Mock<FetchFn>;
  const realFetch = global.fetch;

  beforeEach(() => {
    fetchMock = jest.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          envelope: cannedEnvelope,
          certificate_id: 'cert-test-1',
          certification_level: 'standard',
          issuance: {
            pathway: 'delegated',
            authority: 'mcp:edm-server',
            timestamp: '2026-07-22T00:00:00Z',
            issuer_did: 'did:key:ztest',
          },
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  const makeHandler = () =>
    new SealToolHandler(null, () => null, 'dd_test_key', 'http://localhost:3000');

  it('seals a platform-spec 0.8.x artifact (no top-level artifact_id)', async () => {
    const artifact = platformArtifact();
    expect(artifact.artifact_id).toBeUndefined(); // the S7 defect precondition

    const result = await makeHandler().execute({ artifact });

    expect(result.envelope).toEqual(cannedEnvelope);
    expect(result.certificate_id).toBe('cert-test-1');
    expect(result.certification_level).toBe('standard');
  });

  it('forwards the artifact to /api/v1/issue verbatim (interop contract)', async () => {
    const artifact = platformArtifact();
    await makeHandler().execute({ artifact, pathway: 'delegated' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/v1/issue');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.artifact).toEqual(artifact);
    expect(body.pathway).toBe('delegated');
    expect(body.authority).toBe('mcp:edm-server');
  });

  it('returns the platform envelope untouched (no reshaping)', async () => {
    const result = await makeHandler().execute({ artifact: platformArtifact() });
    // Verbatim pass-through is what makes the envelope verify in
    // ddna-tools CLI and ddna-reader offline — never rewrite it.
    expect(JSON.stringify(result.envelope)).toBe(JSON.stringify(cannedEnvelope));
  });

  it.each([null, undefined, 'restricted', 'allowed'])(
    'accepts spec governance.exportability=%s (platform decides, not us)',
    async (exportability) => {
      const artifact = platformArtifact();
      (artifact.governance as Record<string, unknown>).exportability = exportability;
      await expect(makeHandler().execute({ artifact })).resolves.toBeDefined();
    }
  );

  it("rejects spec exportability='forbidden' as GOVERNANCE_VIOLATION without calling the API", async () => {
    const artifact = platformArtifact();
    (artifact.governance as Record<string, unknown>).exportability = 'forbidden';

    await expect(makeHandler().execute({ artifact })).rejects.toMatchObject({
      code: SealErrorCode.GOVERNANCE_VIOLATION,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects legacy exportability='prohibited' as GOVERNANCE_VIOLATION", async () => {
    const artifact = platformArtifact();
    (artifact.governance as Record<string, unknown>).exportability = 'prohibited';

    await expect(makeHandler().execute({ artifact })).rejects.toMatchObject({
      code: SealErrorCode.GOVERNANCE_VIOLATION,
    });
  });

  it('rejects a legacy-shaped artifact (no meta/core) as INVALID_INPUT', async () => {
    // The platform's seal() refuses payloads without meta + core domains;
    // fail fast locally with the true reason instead of a 4xx round-trip.
    const legacy = {
      schema_version: '0.8.0',
      artifact_id: 'edm_legacy_1',
      content: { type: 'test', data: {} },
      governance: { exportability: 'allowed' },
    };

    await expect(makeHandler().execute({ artifact: legacy })).rejects.toMatchObject({
      code: SealErrorCode.INVALID_INPUT,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an artifact missing meta.version as INVALID_INPUT', async () => {
    const artifact = platformArtifact();
    delete (artifact.meta as Record<string, unknown>).version;

    await expect(makeHandler().execute({ artifact })).rejects.toMatchObject({
      code: SealErrorCode.INVALID_INPUT,
    });
  });

  it('rejects an artifact missing the core domain as INVALID_INPUT', async () => {
    const artifact = platformArtifact();
    delete artifact.core;

    await expect(makeHandler().execute({ artifact })).rejects.toMatchObject({
      code: SealErrorCode.INVALID_INPUT,
    });
  });

  it('warns (not fails) when governance is absent — Certified is the platform gate', async () => {
    const artifact = platformArtifact();
    delete artifact.governance;

    const result = await makeHandler().execute({ artifact });
    expect(result.warnings?.some((w) => w.includes('governance'))).toBe(true);
  });
});
