/**
 * File system storage implementation for local development
 */

import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
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
 * File system artifact storage
 */
export class FileSystemArtifactStorage extends BaseArtifactStorage {
  private readonly basePath: string;

  constructor(basePath: string) {
    super();
    this.basePath = basePath;
  }

  private getFilePath(id: string): string {
    // Sanitize ID to prevent directory traversal
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.basePath, 'artifacts', `${safeId}.json`);
  }

  async load(id: string): Promise<EdmArtifact> {
    const filePath = this.getFilePath(id);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as EdmArtifact;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageError(
          `Artifact not found: ${id}`,
          StorageErrorCode.NOT_FOUND
        );
      }
      throw new StorageError(
        `Failed to load artifact: ${id}`,
        StorageErrorCode.UNKNOWN,
        error as Error
      );
    }
  }

  async save(artifact: EdmArtifact): Promise<string> {
    // Ensure artifact has an ID
    if (!artifact.artifact_id) {
      artifact.artifact_id = this.generateId();
    }

    this.validateArtifact(artifact);

    const filePath = this.getFilePath(artifact.artifact_id);

    try {
      // Ensure directory exists
      await fs.mkdir(dirname(filePath), { recursive: true });

      // Write artifact
      await fs.writeFile(filePath, JSON.stringify(artifact, null, 2), 'utf-8');

      return artifact.artifact_id;
    } catch (error) {
      throw new StorageError(
        `Failed to save artifact: ${artifact.artifact_id}`,
        StorageErrorCode.UNKNOWN,
        error as Error
      );
    }
  }

  async list(filter?: StorageFilter): Promise<string[]> {
    const artifactsDir = join(this.basePath, 'artifacts');

    try {
      const files = await fs.readdir(artifactsDir);
      let ids = files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''));

      // Apply filters
      if (filter) {
        if (filter.limit) {
          const offset = filter.offset || 0;
          ids = ids.slice(offset, offset + filter.limit);
        }

        // For more complex filters, we'd need to load and check each artifact
        // This is a simple implementation for local development
      }

      return ids;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw new StorageError(
        'Failed to list artifacts',
        StorageErrorCode.UNKNOWN,
        error as Error
      );
    }
  }

  async delete(id: string): Promise<void> {
    const filePath = this.getFilePath(id);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageError(
          `Artifact not found: ${id}`,
          StorageErrorCode.NOT_FOUND
        );
      }
      throw new StorageError(
        `Failed to delete artifact: ${id}`,
        StorageErrorCode.UNKNOWN,
        error as Error
      );
    }
  }

  async exists(id: string): Promise<boolean> {
    const filePath = this.getFilePath(id);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * File system envelope storage
 */
export class FileSystemEnvelopeStorage extends BaseEnvelopeStorage {
  private readonly basePath: string;

  constructor(basePath: string) {
    super();
    this.basePath = basePath;
  }

  private getFilePath(id: string): string {
    // Sanitize ID to prevent directory traversal
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.basePath, 'envelopes', `${safeId}.ddna`);
  }

  async load(id: string): Promise<DdnaEnvelope> {
    const filePath = this.getFilePath(id);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as DdnaEnvelope;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageError(
          `Envelope not found: ${id}`,
          StorageErrorCode.NOT_FOUND
        );
      }
      throw new StorageError(
        `Failed to load envelope: ${id}`,
        StorageErrorCode.UNKNOWN,
        error as Error
      );
    }
  }

  async save(envelope: DdnaEnvelope): Promise<string> {
    this.validateEnvelope(envelope);

    const id = this.generateId(envelope);
    const filePath = this.getFilePath(id);

    try {
      // Ensure directory exists
      await fs.mkdir(dirname(filePath), { recursive: true });

      // Write envelope
      await fs.writeFile(filePath, JSON.stringify(envelope, null, 2), 'utf-8');

      return id;
    } catch (error) {
      throw new StorageError(
        `Failed to save envelope`,
        StorageErrorCode.UNKNOWN,
        error as Error
      );
    }
  }

  async list(filter?: StorageFilter): Promise<string[]> {
    const envelopesDir = join(this.basePath, 'envelopes');

    try {
      const files = await fs.readdir(envelopesDir);
      let ids = files
        .filter((f) => f.endsWith('.ddna'))
        .map((f) => f.replace('.ddna', ''));

      // Apply filters
      if (filter?.limit) {
        const offset = filter.offset || 0;
        ids = ids.slice(offset, offset + filter.limit);
      }

      return ids;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw new StorageError(
        'Failed to list envelopes',
        StorageErrorCode.UNKNOWN,
        error as Error
      );
    }
  }

  async delete(id: string): Promise<void> {
    const filePath = this.getFilePath(id);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageError(
          `Envelope not found: ${id}`,
          StorageErrorCode.NOT_FOUND
        );
      }
      throw new StorageError(
        `Failed to delete envelope: ${id}`,
        StorageErrorCode.UNKNOWN,
        error as Error
      );
    }
  }

  async exists(id: string): Promise<boolean> {
    const filePath = this.getFilePath(id);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create file system storage factory
 */
export function createFileSystemStorage(basePath: string) {
  return {
    createArtifactStorage: () => new FileSystemArtifactStorage(basePath),
    createEnvelopeStorage: () => new FileSystemEnvelopeStorage(basePath),
  };
}
