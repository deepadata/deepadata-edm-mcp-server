/**
 * Base storage interface and abstract implementation
 */

import type {
  EdmArtifact,
  DdnaEnvelope,
  ArtifactStorage,
  EnvelopeStorage,
  StorageFilter,
} from '../types.js';

/**
 * Storage error types
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: StorageErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export enum StorageErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INVALID_DATA = 'INVALID_DATA',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Abstract base class for artifact storage implementations
 */
export abstract class BaseArtifactStorage implements ArtifactStorage {
  abstract load(id: string): Promise<EdmArtifact>;
  abstract save(artifact: EdmArtifact): Promise<string>;
  abstract list(filter?: StorageFilter): Promise<string[]>;
  abstract delete(id: string): Promise<void>;
  abstract exists(id: string): Promise<boolean>;

  /**
   * Validate artifact structure before saving
   */
  protected validateArtifact(artifact: EdmArtifact): void {
    if (!artifact.artifact_id) {
      throw new StorageError(
        'Artifact must have an artifact_id',
        StorageErrorCode.INVALID_DATA
      );
    }

    if (!artifact.schema_version) {
      throw new StorageError(
        'Artifact must have a schema_version',
        StorageErrorCode.INVALID_DATA
      );
    }

    if (!artifact.governance) {
      throw new StorageError(
        'Artifact must have governance settings',
        StorageErrorCode.INVALID_DATA
      );
    }
  }

  /**
   * Generate a unique artifact ID if not provided
   */
  protected generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `edm_${timestamp}_${random}`;
  }
}

/**
 * Abstract base class for envelope storage implementations
 */
export abstract class BaseEnvelopeStorage implements EnvelopeStorage {
  abstract load(id: string): Promise<DdnaEnvelope>;
  abstract save(envelope: DdnaEnvelope): Promise<string>;
  abstract list(filter?: StorageFilter): Promise<string[]>;
  abstract delete(id: string): Promise<void>;
  abstract exists(id: string): Promise<boolean>;

  /**
   * Validate envelope structure before saving
   */
  protected validateEnvelope(envelope: DdnaEnvelope): void {
    if (!envelope.artifact) {
      throw new StorageError(
        'Envelope must contain an artifact',
        StorageErrorCode.INVALID_DATA
      );
    }

    if (!envelope.signature) {
      throw new StorageError(
        'Envelope must have a signature',
        StorageErrorCode.INVALID_DATA
      );
    }

    if (!envelope.signature.signer_did) {
      throw new StorageError(
        'Envelope signature must have a signer DID',
        StorageErrorCode.INVALID_DATA
      );
    }
  }

  /**
   * Generate envelope ID from artifact ID
   */
  protected generateId(envelope: DdnaEnvelope): string {
    const artifactId = envelope.artifact.artifact_id;
    const timestamp = Date.now().toString(36);
    return `ddna_${artifactId}_${timestamp}`;
  }
}

/**
 * Storage factory interface
 */
export interface StorageFactory {
  createArtifactStorage(): ArtifactStorage;
  createEnvelopeStorage(): EnvelopeStorage;
}
