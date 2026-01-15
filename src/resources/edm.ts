/**
 * EDM Artifact Resource Provider
 *
 * Exposes EDM artifacts as MCP resources via edm://artifact/{id} URIs
 */

import type { ArtifactStorage, AuthContext, EdmArtifact } from '../types.js';
import { canAccess } from '../security/governance.js';
import { StorageErrorCode } from '../storage/base.js';

/**
 * EDM resource URI prefix
 */
export const EDM_URI_PREFIX = 'edm://artifact/';

/**
 * MIME type for EDM artifacts
 */
export const EDM_MIME_TYPE = 'application/json';

/**
 * Parse artifact ID from URI
 */
export function parseEdmUri(uri: string): string | null {
  if (!uri.startsWith(EDM_URI_PREFIX)) {
    return null;
  }
  const id = uri.slice(EDM_URI_PREFIX.length);
  return id || null;
}

/**
 * Build URI from artifact ID
 */
export function buildEdmUri(id: string): string {
  return `${EDM_URI_PREFIX}${id}`;
}

/**
 * Resource read result
 */
export interface EdmResourceResult {
  uri: string;
  mimeType: string;
  text: string;
}

/**
 * Resource error
 */
export class EdmResourceError extends Error {
  constructor(
    message: string,
    public readonly code: EdmResourceErrorCode
  ) {
    super(message);
    this.name = 'EdmResourceError';
  }
}

export enum EdmResourceErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  ACCESS_DENIED = 'ACCESS_DENIED',
  INVALID_URI = 'INVALID_URI',
  STORAGE_ERROR = 'STORAGE_ERROR',
}

/**
 * EDM Resource Provider class
 */
export class EdmResourceProvider {
  constructor(
    private readonly storage: ArtifactStorage,
    private readonly getAuthContext: () => AuthContext | null
  ) {}

  /**
   * Read an EDM artifact resource
   */
  async read(uri: string): Promise<EdmResourceResult> {
    // Parse URI
    const id = parseEdmUri(uri);
    if (!id) {
      throw new EdmResourceError(
        `Invalid EDM URI: ${uri}`,
        EdmResourceErrorCode.INVALID_URI
      );
    }

    // Load artifact from storage
    let artifact: EdmArtifact;
    try {
      artifact = await this.storage.load(id);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === StorageErrorCode.NOT_FOUND
      ) {
        throw new EdmResourceError(
          `Artifact not found: ${id}`,
          EdmResourceErrorCode.NOT_FOUND
        );
      }
      throw new EdmResourceError(
        `Failed to load artifact: ${id}`,
        EdmResourceErrorCode.STORAGE_ERROR
      );
    }

    // Check access permissions
    const authContext = this.getAuthContext();
    const accessCheck = canAccess(artifact, authContext, 'export');

    if (!accessCheck.allowed) {
      throw new EdmResourceError(
        `Access denied: ${accessCheck.reasons.join(', ')}`,
        EdmResourceErrorCode.ACCESS_DENIED
      );
    }

    // Return resource
    return {
      uri,
      mimeType: EDM_MIME_TYPE,
      text: JSON.stringify(artifact, null, 2),
    };
  }

  /**
   * List available EDM artifact resources
   */
  async list(): Promise<EdmResourceListItem[]> {
    const authContext = this.getAuthContext();
    const ids = await this.storage.list();

    const resources: EdmResourceListItem[] = [];

    for (const id of ids) {
      try {
        const artifact = await this.storage.load(id);

        // Check if user can access this artifact
        const accessCheck = canAccess(artifact, authContext, 'read');
        if (!accessCheck.allowed) {
          continue;
        }

        resources.push({
          uri: buildEdmUri(id),
          name: artifact.meta.title || id,
          description: artifact.meta.description,
          mimeType: EDM_MIME_TYPE,
        });
      } catch {
        // Skip artifacts that fail to load
        continue;
      }
    }

    return resources;
  }

  /**
   * Check if a URI matches this provider
   */
  static matches(uri: string): boolean {
    return uri.startsWith(EDM_URI_PREFIX);
  }
}

/**
 * Resource list item
 */
export interface EdmResourceListItem {
  uri: string;
  name: string;
  description?: string;
  mimeType: string;
}

/**
 * Create resource templates for MCP server
 */
export function getEdmResourceTemplates() {
  return [
    {
      uriTemplate: 'edm://artifact/{id}',
      name: 'EDM Artifact',
      description: 'Read an EDM v0.4.0 artifact by ID',
      mimeType: EDM_MIME_TYPE,
    },
  ];
}
