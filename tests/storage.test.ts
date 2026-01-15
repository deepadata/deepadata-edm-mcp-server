/**
 * Tests for storage implementations
 */

import {
  MemoryArtifactStorage,
  MemoryEnvelopeStorage,
  createMemoryStorage,
  StorageError,
  StorageErrorCode,
} from '../src/storage/index.js';
import type { EdmArtifact, DdnaEnvelope } from '../src/types.js';

describe('Storage', () => {
  // Helper to create test artifacts
  const createArtifact = (id?: string): EdmArtifact => ({
    schema_version: '0.4.0',
    artifact_id: id || `test-${Date.now()}`,
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

  // Helper to create test envelopes
  const createEnvelope = (artifactId?: string): DdnaEnvelope => ({
    version: '1.0',
    artifact: createArtifact(artifactId),
    signature: {
      algorithm: 'Ed25519',
      signer_did: 'did:example:123',
      value: 'test-signature',
    },
    sealed_at: new Date().toISOString(),
  });

  describe('MemoryArtifactStorage', () => {
    let storage: MemoryArtifactStorage;

    beforeEach(() => {
      storage = new MemoryArtifactStorage();
    });

    it('should save and load artifacts', async () => {
      const artifact = createArtifact('art-1');
      await storage.save(artifact);

      const loaded = await storage.load('art-1');
      expect(loaded.artifact_id).toBe('art-1');
      expect(loaded.content.data).toEqual({ foo: 'bar' });
    });

    it('should generate id if not provided', async () => {
      const artifact = createArtifact();
      artifact.artifact_id = '';

      const id = await storage.save(artifact);
      expect(id).toMatch(/^edm_/);

      const loaded = await storage.load(id);
      expect(loaded.artifact_id).toBe(id);
    });

    it('should throw NOT_FOUND for missing artifact', async () => {
      await expect(storage.load('nonexistent')).rejects.toThrow(StorageError);
      await expect(storage.load('nonexistent')).rejects.toMatchObject({
        code: StorageErrorCode.NOT_FOUND,
      });
    });

    it('should list artifacts', async () => {
      await storage.save(createArtifact('art-1'));
      await storage.save(createArtifact('art-2'));
      await storage.save(createArtifact('art-3'));

      const ids = await storage.list();
      expect(ids).toHaveLength(3);
      expect(ids).toContain('art-1');
      expect(ids).toContain('art-2');
      expect(ids).toContain('art-3');
    });

    it('should filter by userId', async () => {
      const art1 = createArtifact('art-1');
      art1.meta.owner_user_id = 'user-1';
      await storage.save(art1);

      const art2 = createArtifact('art-2');
      art2.meta.owner_user_id = 'user-2';
      await storage.save(art2);

      const ids = await storage.list({ userId: 'user-1' });
      expect(ids).toHaveLength(1);
      expect(ids).toContain('art-1');
    });

    it('should filter by visibility', async () => {
      const art1 = createArtifact('art-1');
      art1.meta.visibility = 'public';
      await storage.save(art1);

      const art2 = createArtifact('art-2');
      art2.meta.visibility = 'private';
      await storage.save(art2);

      const ids = await storage.list({ visibility: 'public' });
      expect(ids).toHaveLength(1);
      expect(ids).toContain('art-1');
    });

    it('should support pagination', async () => {
      for (let i = 1; i <= 10; i++) {
        await storage.save(createArtifact(`art-${i}`));
      }

      const page1 = await storage.list({ limit: 3, offset: 0 });
      expect(page1).toHaveLength(3);

      const page2 = await storage.list({ limit: 3, offset: 3 });
      expect(page2).toHaveLength(3);

      // Pages should be different
      expect(page1).not.toEqual(page2);
    });

    it('should delete artifacts', async () => {
      await storage.save(createArtifact('art-1'));
      expect(await storage.exists('art-1')).toBe(true);

      await storage.delete('art-1');
      expect(await storage.exists('art-1')).toBe(false);
    });

    it('should throw NOT_FOUND when deleting nonexistent', async () => {
      await expect(storage.delete('nonexistent')).rejects.toThrow(StorageError);
    });

    it('should check existence', async () => {
      expect(await storage.exists('art-1')).toBe(false);
      await storage.save(createArtifact('art-1'));
      expect(await storage.exists('art-1')).toBe(true);
    });

    it('should clear all artifacts', () => {
      storage.clear();
      expect(storage.count()).toBe(0);
    });

    it('should return copies to prevent mutation', async () => {
      const artifact = createArtifact('art-1');
      await storage.save(artifact);

      const loaded = await storage.load('art-1');
      loaded.content.data = { modified: true };

      const loadedAgain = await storage.load('art-1');
      expect(loadedAgain.content.data).toEqual({ foo: 'bar' });
    });
  });

  describe('MemoryEnvelopeStorage', () => {
    let storage: MemoryEnvelopeStorage;

    beforeEach(() => {
      storage = new MemoryEnvelopeStorage();
    });

    it('should save and load envelopes', async () => {
      const envelope = createEnvelope('art-1');
      const id = await storage.save(envelope);

      const loaded = await storage.load(id);
      expect(loaded.artifact.artifact_id).toBe('art-1');
      expect(loaded.signature.signer_did).toBe('did:example:123');
    });

    it('should throw NOT_FOUND for missing envelope', async () => {
      await expect(storage.load('nonexistent')).rejects.toThrow(StorageError);
    });

    it('should list envelopes', async () => {
      const id1 = await storage.save(createEnvelope('art-1'));
      const id2 = await storage.save(createEnvelope('art-2'));

      const ids = await storage.list();
      expect(ids).toHaveLength(2);
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
    });

    it('should delete envelopes', async () => {
      const id = await storage.save(createEnvelope('art-1'));
      expect(await storage.exists(id)).toBe(true);

      await storage.delete(id);
      expect(await storage.exists(id)).toBe(false);
    });
  });

  describe('createMemoryStorage', () => {
    it('should create shared storage instances', () => {
      const factory = createMemoryStorage();

      const artifactStorage1 = factory.createArtifactStorage();
      const artifactStorage2 = factory.createArtifactStorage();

      // Should be the same instance
      expect(artifactStorage1).toBe(artifactStorage2);
    });

    it('should clear all storage', async () => {
      const factory = createMemoryStorage();
      const artifactStorage = factory.createArtifactStorage();
      const envelopeStorage = factory.createEnvelopeStorage();

      await artifactStorage.save(createArtifact('art-1'));
      await envelopeStorage.save(createEnvelope('art-2'));

      factory.clearAll();

      expect(await artifactStorage.list()).toHaveLength(0);
      expect(await envelopeStorage.list()).toHaveLength(0);
    });
  });
});
