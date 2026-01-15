/**
 * Tests for tool handlers
 */

import {
  ExtractToolHandler,
  ExtractionError,
  ExtractionErrorCode,
  SealToolHandler,
  SealError,
  SealErrorCode,
  hexToKey,
  ValidateToolHandler,
  isValidEdmArtifact,
} from '../src/tools/index.js';
import { MemoryArtifactStorage, MemoryEnvelopeStorage } from '../src/storage/index.js';
import type { EdmArtifact, AuthContext } from '../src/types.js';

describe('Tools', () => {
  const createArtifact = (id: string): EdmArtifact => ({
    schema_version: '0.4.0',
    artifact_id: id,
    meta: {
      created_at: new Date().toISOString(),
      visibility: 'private',
      owner_user_id: 'user-1',
    },
    content: {
      type: 'test',
      data: { foo: 'bar' },
    },
    provenance: {
      source: 'test',
    },
    governance: {
      exportability: 'allowed',
    },
  });

  describe('ExtractToolHandler', () => {
    let storage: MemoryArtifactStorage;
    let authContext: AuthContext;
    let handler: ExtractToolHandler;

    beforeEach(() => {
      storage = new MemoryArtifactStorage();
      authContext = { userId: 'user-1', roles: ['user'] };
      handler = new ExtractToolHandler(storage, () => authContext);
    });

    it('should extract artifact from text', async () => {
      const result = await handler.execute({
        text: 'Hello, this is test content.',
      });

      expect(result.artifact).toBeDefined();
      expect(result.artifact.artifact_id).toBeDefined();
      expect(result.artifact.schema_version).toBe('0.4.0');
      expect(result.artifact.content.data.source_text).toBe(
        'Hello, this is test content.'
      );
    });

    it('should set owner from auth context', async () => {
      const result = await handler.execute({
        text: 'Test content',
      });

      expect(result.artifact.meta.owner_user_id).toBe('user-1');
    });

    it('should save artifact when requested', async () => {
      const result = await handler.execute({
        text: 'Test content',
        save: true,
      });

      expect(result.savedId).toBeDefined();

      const loaded = await storage.load(result.savedId!);
      expect(loaded.artifact_id).toBe(result.artifact.artifact_id);
    });

    it('should throw INVALID_INPUT for empty text', async () => {
      await expect(handler.execute({ text: '' })).rejects.toThrow(ExtractionError);
      await expect(handler.execute({ text: '' })).rejects.toMatchObject({
        code: ExtractionErrorCode.INVALID_INPUT,
      });
    });

    it('should throw INVALID_INPUT for whitespace-only text', async () => {
      await expect(handler.execute({ text: '   ' })).rejects.toMatchObject({
        code: ExtractionErrorCode.INVALID_INPUT,
      });
    });

    it('should include image flag in extraction', async () => {
      const result = await handler.execute({
        text: 'Test with image',
        image: 'base64encodedimage',
      });

      expect(result.artifact.content.data.has_image).toBe(true);
    });

    it('should include metadata in extraction', async () => {
      const result = await handler.execute({
        text: 'Test with metadata',
        metadata: { custom: 'value' },
      });

      expect(result.artifact.content.data.custom).toBe('value');
    });

    it('should use custom extractor when provided', async () => {
      const customHandler = new ExtractToolHandler(
        storage,
        () => authContext,
        async () => createArtifact('custom-extracted')
      );

      const result = await customHandler.execute({
        text: 'Test content',
      });

      expect(result.artifact.artifact_id).toBe('custom-extracted');
    });
  });

  describe('SealToolHandler', () => {
    let storage: MemoryEnvelopeStorage;
    let authContext: AuthContext;
    let handler: SealToolHandler;

    const testPrivateKey =
      '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    beforeEach(() => {
      storage = new MemoryEnvelopeStorage();
      authContext = { userId: 'user-1', roles: ['user'] };
      handler = new SealToolHandler(storage, () => authContext);
    });

    it('should seal artifact into envelope', async () => {
      const result = await handler.execute({
        artifact: createArtifact('art-1'),
        privateKey: testPrivateKey,
        did: 'did:example:123',
      });

      expect(result.envelope).toBeDefined();
      expect(result.envelope.artifact.artifact_id).toBe('art-1');
      expect(result.envelope.signature.signer_did).toBe('did:example:123');
      expect(result.envelope.sealed_at).toBeDefined();
    });

    it('should save envelope when requested', async () => {
      const result = await handler.execute({
        artifact: createArtifact('art-1'),
        privateKey: testPrivateKey,
        did: 'did:example:123',
        save: true,
      });

      expect(result.savedId).toBeDefined();

      const loaded = await storage.load(result.savedId!);
      expect(loaded.artifact.artifact_id).toBe('art-1');
    });

    it('should throw INVALID_INPUT for missing artifact', async () => {
      await expect(
        handler.execute({
          artifact: null as unknown as EdmArtifact,
          privateKey: testPrivateKey,
          did: 'did:example:123',
        })
      ).rejects.toMatchObject({
        code: SealErrorCode.INVALID_INPUT,
      });
    });

    it('should throw INVALID_INPUT for artifact without id', async () => {
      const artifact = createArtifact('');
      artifact.artifact_id = '';

      await expect(
        handler.execute({
          artifact,
          privateKey: testPrivateKey,
          did: 'did:example:123',
        })
      ).rejects.toMatchObject({
        code: SealErrorCode.INVALID_INPUT,
      });
    });

    it('should throw GOVERNANCE_VIOLATION for non-exportable artifacts', async () => {
      const artifact = createArtifact('art-1');
      artifact.governance.exportability = 'prohibited';

      await expect(
        handler.execute({
          artifact,
          privateKey: testPrivateKey,
          did: 'did:example:123',
        })
      ).rejects.toMatchObject({
        code: SealErrorCode.GOVERNANCE_VIOLATION,
      });
    });

    it('should throw INVALID_INPUT for invalid DID', async () => {
      await expect(
        handler.execute({
          artifact: createArtifact('art-1'),
          privateKey: testPrivateKey,
          did: 'invalid-did',
        })
      ).rejects.toMatchObject({
        code: SealErrorCode.INVALID_INPUT,
      });
    });

    it('should throw INVALID_KEY for invalid hex', async () => {
      await expect(
        handler.execute({
          artifact: createArtifact('art-1'),
          privateKey: 'not-hex!',
          did: 'did:example:123',
        })
      ).rejects.toMatchObject({
        code: SealErrorCode.INVALID_KEY,
      });
    });

    it('should include warnings in result', async () => {
      const artifact = createArtifact('art-1');
      (artifact.meta as { visibility?: string }).visibility = undefined;

      const result = await handler.execute({
        artifact,
        privateKey: testPrivateKey,
        did: 'did:example:123',
      });

      expect(result.warnings).toBeDefined();
      expect(result.warnings?.length).toBeGreaterThan(0);
    });
  });

  describe('hexToKey', () => {
    it('should convert hex string to Uint8Array', () => {
      const result = hexToKey('0102030405');
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    });

    it('should handle 0x prefix', () => {
      const result = hexToKey('0x0102030405');
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    });

    it('should throw for invalid hex', () => {
      expect(() => hexToKey('ghijkl')).toThrow(SealError);
    });

    it('should throw for odd-length hex', () => {
      expect(() => hexToKey('012')).toThrow(SealError);
    });
  });

  describe('ValidateToolHandler', () => {
    let handler: ValidateToolHandler;

    beforeEach(() => {
      handler = new ValidateToolHandler();
    });

    it('should validate correct artifact', async () => {
      const result = await handler.execute({
        artifact: createArtifact('art-1'),
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing schema_version', async () => {
      const artifact = createArtifact('art-1');
      (artifact as { schema_version?: string }).schema_version = undefined;

      const result = await handler.execute({ artifact });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'schema_version')).toBe(true);
    });

    it('should detect missing artifact_id', async () => {
      const artifact = createArtifact('');
      artifact.artifact_id = '';

      const result = await handler.execute({ artifact });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'artifact_id')).toBe(true);
    });

    it('should detect missing meta', async () => {
      const artifact = createArtifact('art-1');
      (artifact as { meta?: unknown }).meta = undefined;

      const result = await handler.execute({ artifact });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'meta')).toBe(true);
    });

    it('should detect missing content', async () => {
      const artifact = createArtifact('art-1');
      (artifact as { content?: unknown }).content = undefined;

      const result = await handler.execute({ artifact });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'content')).toBe(true);
    });

    it('should detect missing governance', async () => {
      const artifact = createArtifact('art-1');
      (artifact as { governance?: unknown }).governance = undefined;

      const result = await handler.execute({ artifact });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'governance')).toBe(true);
    });

    it('should include warnings for missing optional fields', async () => {
      const artifact = createArtifact('art-1');
      (artifact.meta as { visibility?: string }).visibility = undefined;

      const result = await handler.execute({ artifact });

      expect(result.valid).toBe(true);
      expect(result.warnings?.some((w) => w.path === 'meta.visibility')).toBe(true);
    });

    it('should treat warnings as errors in strict mode', async () => {
      const artifact = createArtifact('art-1');
      (artifact.meta as { visibility?: string }).visibility = undefined;

      const result = await handler.execute({ artifact, strict: true });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code.startsWith('STRICT_'))).toBe(true);
    });

    it('should detect invalid date format', async () => {
      const artifact = createArtifact('art-1');
      artifact.meta.created_at = 'not-a-date';

      const result = await handler.execute({ artifact });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'meta.created_at')).toBe(true);
    });

    it('should detect invalid visibility value', async () => {
      const artifact = createArtifact('art-1');
      (artifact.meta as { visibility: string }).visibility = 'invalid';

      const result = await handler.execute({ artifact });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'meta.visibility')).toBe(true);
    });
  });

  describe('isValidEdmArtifact', () => {
    it('should return true for valid artifacts', () => {
      expect(isValidEdmArtifact(createArtifact('art-1'))).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidEdmArtifact(null)).toBe(false);
    });

    it('should return false for non-objects', () => {
      expect(isValidEdmArtifact('string')).toBe(false);
      expect(isValidEdmArtifact(123)).toBe(false);
    });

    it('should return false for missing required fields', () => {
      expect(isValidEdmArtifact({})).toBe(false);
      expect(isValidEdmArtifact({ schema_version: '0.4.0' })).toBe(false);
    });
  });
});
