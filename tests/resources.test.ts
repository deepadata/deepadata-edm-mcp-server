/**
 * Tests for resource providers
 */

import {
  EdmResourceProvider,
  EdmResourceError,
  EdmResourceErrorCode,
  parseEdmUri,
  buildEdmUri,
  DdnaResourceProvider,
  DdnaResourceError,
  DdnaResourceErrorCode,
  parseDdnaUri,
  buildDdnaUri,
} from '../src/resources/index.js';
import { MemoryArtifactStorage, MemoryEnvelopeStorage } from '../src/storage/index.js';
import type { EdmArtifact, DdnaEnvelope, AuthContext } from '../src/types.js';

describe('Resources', () => {
  // Helpers
  const createArtifact = (
    id: string,
    overrides: Partial<EdmArtifact> = {}
  ): EdmArtifact => ({
    schema_version: '0.4.0',
    artifact_id: id,
    meta: {
      created_at: new Date().toISOString(),
      visibility: 'private',
      owner_user_id: 'user-1',
      title: `Artifact ${id}`,
      ...overrides.meta,
    },
    content: {
      type: 'test',
      data: {},
      ...overrides.content,
    },
    provenance: {
      source: 'test',
      ...overrides.provenance,
    },
    governance: {
      exportability: 'allowed',
      ...overrides.governance,
    },
  });

  const createEnvelope = (artifactId: string): DdnaEnvelope => ({
    version: '1.0',
    artifact: createArtifact(artifactId),
    signature: {
      algorithm: 'Ed25519',
      signer_did: 'did:example:123',
      value: 'test-signature-value',
    },
    sealed_at: new Date().toISOString(),
  });

  describe('EDM URI Parsing', () => {
    it('should parse valid EDM URIs', () => {
      expect(parseEdmUri('edm://artifact/test-123')).toBe('test-123');
      expect(parseEdmUri('edm://artifact/my-artifact')).toBe('my-artifact');
    });

    it('should return null for invalid URIs', () => {
      expect(parseEdmUri('ddna://envelope/test')).toBeNull();
      expect(parseEdmUri('http://example.com')).toBeNull();
      expect(parseEdmUri('edm://artifact/')).toBeNull();
    });

    it('should build EDM URIs', () => {
      expect(buildEdmUri('test-123')).toBe('edm://artifact/test-123');
    });
  });

  describe('DDNA URI Parsing', () => {
    it('should parse valid DDNA URIs', () => {
      expect(parseDdnaUri('ddna://envelope/env-123')).toBe('env-123');
    });

    it('should return null for invalid URIs', () => {
      expect(parseDdnaUri('edm://artifact/test')).toBeNull();
      expect(parseDdnaUri('ddna://envelope/')).toBeNull();
    });

    it('should build DDNA URIs', () => {
      expect(buildDdnaUri('env-123')).toBe('ddna://envelope/env-123');
    });
  });

  describe('EdmResourceProvider', () => {
    let storage: MemoryArtifactStorage;
    let authContext: AuthContext | null;
    let provider: EdmResourceProvider;

    beforeEach(() => {
      storage = new MemoryArtifactStorage();
      authContext = { userId: 'user-1', roles: ['user'] };
      provider = new EdmResourceProvider(storage, () => authContext);
    });

    it('should read artifact by URI', async () => {
      await storage.save(createArtifact('art-1'));

      const result = await provider.read('edm://artifact/art-1');

      expect(result.uri).toBe('edm://artifact/art-1');
      expect(result.mimeType).toBe('application/json');

      const artifact = JSON.parse(result.text);
      expect(artifact.artifact_id).toBe('art-1');
    });

    it('should throw INVALID_URI for invalid URIs', async () => {
      await expect(provider.read('invalid://uri')).rejects.toThrow(EdmResourceError);
      await expect(provider.read('invalid://uri')).rejects.toMatchObject({
        code: EdmResourceErrorCode.INVALID_URI,
      });
    });

    it('should throw NOT_FOUND for missing artifacts', async () => {
      await expect(provider.read('edm://artifact/nonexistent')).rejects.toThrow(
        EdmResourceError
      );
      await expect(provider.read('edm://artifact/nonexistent')).rejects.toMatchObject(
        {
          code: EdmResourceErrorCode.NOT_FOUND,
        }
      );
    });

    it('should throw ACCESS_DENIED for prohibited artifacts', async () => {
      await storage.save(
        createArtifact('art-1', {
          meta: { created_at: new Date().toISOString(), visibility: 'public' },
          governance: { exportability: 'prohibited' },
        })
      );

      await expect(provider.read('edm://artifact/art-1')).rejects.toThrow(
        EdmResourceError
      );
      await expect(provider.read('edm://artifact/art-1')).rejects.toMatchObject({
        code: EdmResourceErrorCode.ACCESS_DENIED,
      });
    });

    it('should throw ACCESS_DENIED for private artifacts without auth', async () => {
      authContext = null;
      await storage.save(
        createArtifact('art-1', {
          meta: {
            created_at: new Date().toISOString(),
            visibility: 'private',
            owner_user_id: 'user-1',
          },
        })
      );

      await expect(provider.read('edm://artifact/art-1')).rejects.toMatchObject({
        code: EdmResourceErrorCode.ACCESS_DENIED,
      });
    });

    it('should list accessible artifacts', async () => {
      await storage.save(
        createArtifact('art-1', {
          meta: {
            created_at: new Date().toISOString(),
            visibility: 'private',
            owner_user_id: 'user-1',
            title: 'My Artifact',
          },
        })
      );
      await storage.save(
        createArtifact('art-2', {
          meta: {
            created_at: new Date().toISOString(),
            visibility: 'private',
            owner_user_id: 'user-2',
          },
        })
      );

      const resources = await provider.list();

      // Should only see art-1 (owned by user-1)
      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe('edm://artifact/art-1');
      expect(resources[0].name).toBe('My Artifact');
    });

    it('should match EDM URIs', () => {
      expect(EdmResourceProvider.matches('edm://artifact/test')).toBe(true);
      expect(EdmResourceProvider.matches('ddna://envelope/test')).toBe(false);
      expect(EdmResourceProvider.matches('http://example.com')).toBe(false);
    });
  });

  describe('DdnaResourceProvider', () => {
    let storage: MemoryEnvelopeStorage;
    let authContext: AuthContext | null;
    let provider: DdnaResourceProvider;

    beforeEach(() => {
      storage = new MemoryEnvelopeStorage();
      authContext = { userId: 'user-1', roles: ['user'] };
      // Use default signature verifier
      provider = new DdnaResourceProvider(storage, () => authContext);
    });

    it('should read envelope by URI', async () => {
      const envelope = createEnvelope('art-1');
      const id = await storage.save(envelope);

      const result = await provider.read(`ddna://envelope/${id}`);

      expect(result.uri).toBe(`ddna://envelope/${id}`);
      expect(result.mimeType).toBe('application/vnd.deepadata.ddna+json');

      const loaded = JSON.parse(result.text);
      expect(loaded.artifact.artifact_id).toBe('art-1');
      expect(loaded.signature.signer_did).toBe('did:example:123');
    });

    it('should throw INVALID_URI for invalid URIs', async () => {
      await expect(provider.read('edm://artifact/test')).rejects.toMatchObject({
        code: DdnaResourceErrorCode.INVALID_URI,
      });
    });

    it('should throw NOT_FOUND for missing envelopes', async () => {
      await expect(provider.read('ddna://envelope/nonexistent')).rejects.toMatchObject(
        {
          code: DdnaResourceErrorCode.NOT_FOUND,
        }
      );
    });

    it('should throw INVALID_SIGNATURE for bad signatures', async () => {
      const envelope = createEnvelope('art-1');
      envelope.signature.value = ''; // Invalid signature
      const id = await storage.save(envelope);

      // Custom verifier that rejects empty signatures
      const strictProvider = new DdnaResourceProvider(
        storage,
        () => authContext,
        async (env) => ({
          valid: !!env.signature.value,
          error: env.signature.value ? undefined : 'Empty signature',
        })
      );

      await expect(strictProvider.read(`ddna://envelope/${id}`)).rejects.toMatchObject({
        code: DdnaResourceErrorCode.INVALID_SIGNATURE,
      });
    });

    it('should list accessible envelopes', async () => {
      const id = await storage.save(createEnvelope('art-1'));
      await storage.save(createEnvelope('art-2'));

      const resources = await provider.list();

      expect(resources.length).toBeGreaterThanOrEqual(1);
      expect(resources.some((r) => r.uri.includes(id.split('_')[1]))).toBe(true);
    });

    it('should match DDNA URIs', () => {
      expect(DdnaResourceProvider.matches('ddna://envelope/test')).toBe(true);
      expect(DdnaResourceProvider.matches('edm://artifact/test')).toBe(false);
    });
  });
});
