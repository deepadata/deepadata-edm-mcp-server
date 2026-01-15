/**
 * In-memory storage implementation for testing and ephemeral use
 */

import type {
  EdmArtifact,
  DdnaEnvelope,
  StorageFilter,
} from '../types.js';
import {
  BaseArtifactStorage,
  BaseEnvelopeStorage,
  StorageError,
  StorageErrorCode,
} from './base.js';

/**
 * In-memory artifact storage
 */
export class MemoryArtifactStorage extends BaseArtifactStorage {
  private readonly store = new Map<string, EdmArtifact>();

  async load(id: string): Promise<EdmArtifact> {
    const artifact = this.store.get(id);
    if (!artifact) {
      throw new StorageError(
        `Artifact not found: ${id}`,
        StorageErrorCode.NOT_FOUND
      );
    }
    // Return a copy to prevent mutation
    return JSON.parse(JSON.stringify(artifact));
  }

  async save(artifact: EdmArtifact): Promise<string> {
    // Ensure artifact has an ID
    if (!artifact.artifact_id) {
      artifact.artifact_id = this.generateId();
    }

    this.validateArtifact(artifact);

    // Store a copy to prevent mutation
    this.store.set(artifact.artifact_id, JSON.parse(JSON.stringify(artifact)));

    return artifact.artifact_id;
  }

  async list(filter?: StorageFilter): Promise<string[]> {
    let ids = Array.from(this.store.keys());

    // Apply filters
    if (filter) {
      if (filter.userId) {
        ids = ids.filter((id) => {
          const artifact = this.store.get(id);
          return artifact?.meta.owner_user_id === filter.userId;
        });
      }

      if (filter.organizationId) {
        ids = ids.filter((id) => {
          const artifact = this.store.get(id);
          return artifact?.meta.owner_org_id === filter.organizationId;
        });
      }

      if (filter.visibility) {
        ids = ids.filter((id) => {
          const artifact = this.store.get(id);
          return artifact?.meta.visibility === filter.visibility;
        });
      }

      if (filter.tags && filter.tags.length > 0) {
        ids = ids.filter((id) => {
          const artifact = this.store.get(id);
          const artifactTags = artifact?.meta.tags || [];
          return filter.tags!.some((tag) => artifactTags.includes(tag));
        });
      }

      if (filter.limit) {
        const offset = filter.offset || 0;
        ids = ids.slice(offset, offset + filter.limit);
      }
    }

    return ids;
  }

  async delete(id: string): Promise<void> {
    if (!this.store.has(id)) {
      throw new StorageError(
        `Artifact not found: ${id}`,
        StorageErrorCode.NOT_FOUND
      );
    }
    this.store.delete(id);
  }

  async exists(id: string): Promise<boolean> {
    return this.store.has(id);
  }

  /**
   * Clear all stored artifacts (useful for testing)
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get count of stored artifacts
   */
  count(): number {
    return this.store.size;
  }
}

/**
 * In-memory envelope storage
 */
export class MemoryEnvelopeStorage extends BaseEnvelopeStorage {
  private readonly store = new Map<string, DdnaEnvelope>();

  async load(id: string): Promise<DdnaEnvelope> {
    const envelope = this.store.get(id);
    if (!envelope) {
      throw new StorageError(
        `Envelope not found: ${id}`,
        StorageErrorCode.NOT_FOUND
      );
    }
    // Return a copy to prevent mutation
    return JSON.parse(JSON.stringify(envelope));
  }

  async save(envelope: DdnaEnvelope): Promise<string> {
    this.validateEnvelope(envelope);

    const id = this.generateId(envelope);

    // Store a copy to prevent mutation
    this.store.set(id, JSON.parse(JSON.stringify(envelope)));

    return id;
  }

  async list(filter?: StorageFilter): Promise<string[]> {
    let ids = Array.from(this.store.keys());

    // Apply filters based on embedded artifact
    if (filter) {
      if (filter.userId) {
        ids = ids.filter((id) => {
          const envelope = this.store.get(id);
          return envelope?.artifact.meta.owner_user_id === filter.userId;
        });
      }

      if (filter.organizationId) {
        ids = ids.filter((id) => {
          const envelope = this.store.get(id);
          return envelope?.artifact.meta.owner_org_id === filter.organizationId;
        });
      }

      if (filter.limit) {
        const offset = filter.offset || 0;
        ids = ids.slice(offset, offset + filter.limit);
      }
    }

    return ids;
  }

  async delete(id: string): Promise<void> {
    if (!this.store.has(id)) {
      throw new StorageError(
        `Envelope not found: ${id}`,
        StorageErrorCode.NOT_FOUND
      );
    }
    this.store.delete(id);
  }

  async exists(id: string): Promise<boolean> {
    return this.store.has(id);
  }

  /**
   * Clear all stored envelopes (useful for testing)
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get count of stored envelopes
   */
  count(): number {
    return this.store.size;
  }
}

/**
 * Create in-memory storage factory
 */
export function createMemoryStorage() {
  const artifactStorage = new MemoryArtifactStorage();
  const envelopeStorage = new MemoryEnvelopeStorage();

  return {
    createArtifactStorage: () => artifactStorage,
    createEnvelopeStorage: () => envelopeStorage,
    // Expose clear methods for testing
    clearAll: () => {
      artifactStorage.clear();
      envelopeStorage.clear();
    },
  };
}
