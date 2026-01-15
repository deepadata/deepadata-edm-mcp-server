/**
 * DDNA Envelope Resource Provider
 *
 * Exposes sealed DDNA envelopes as MCP resources via ddna://envelope/{id} URIs
 */

import type { EnvelopeStorage, AuthContext, DdnaEnvelope } from '../types.js';
import { canAccessEnvelope } from '../security/governance.js';
import { StorageErrorCode } from '../storage/base.js';

/**
 * DDNA resource URI prefix
 */
export const DDNA_URI_PREFIX = 'ddna://envelope/';

/**
 * MIME type for DDNA envelopes
 */
export const DDNA_MIME_TYPE = 'application/vnd.deepadata.ddna+json';

/**
 * Parse envelope ID from URI
 */
export function parseDdnaUri(uri: string): string | null {
  if (!uri.startsWith(DDNA_URI_PREFIX)) {
    return null;
  }
  const id = uri.slice(DDNA_URI_PREFIX.length);
  return id || null;
}

/**
 * Build URI from envelope ID
 */
export function buildDdnaUri(id: string): string {
  return `${DDNA_URI_PREFIX}${id}`;
}

/**
 * Resource read result
 */
export interface DdnaResourceResult {
  uri: string;
  mimeType: string;
  text: string;
}

/**
 * Resource error
 */
export class DdnaResourceError extends Error {
  constructor(
    message: string,
    public readonly code: DdnaResourceErrorCode
  ) {
    super(message);
    this.name = 'DdnaResourceError';
  }
}

export enum DdnaResourceErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  ACCESS_DENIED = 'ACCESS_DENIED',
  INVALID_URI = 'INVALID_URI',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  STORAGE_ERROR = 'STORAGE_ERROR',
}

/**
 * Signature verification function type
 */
export type VerifySignature = (
  envelope: DdnaEnvelope
) => Promise<{ valid: boolean; error?: string }>;

/**
 * Default signature verifier (placeholder)
 *
 * In production, this should use deepadata-ddna-tools verify function
 */
const defaultVerifier: VerifySignature = async (envelope: DdnaEnvelope) => {
  // Basic validation that signature exists
  if (!envelope.signature?.value) {
    return { valid: false, error: 'Missing signature' };
  }
  if (!envelope.signature?.signer_did) {
    return { valid: false, error: 'Missing signer DID' };
  }

  // In production, verify cryptographic signature
  // For now, accept if signature exists
  return { valid: true };
};

/**
 * DDNA Resource Provider class
 */
export class DdnaResourceProvider {
  private readonly verifySignature: VerifySignature;

  constructor(
    private readonly storage: EnvelopeStorage,
    private readonly getAuthContext: () => AuthContext | null,
    verifySignature?: VerifySignature
  ) {
    this.verifySignature = verifySignature || defaultVerifier;
  }

  /**
   * Read a DDNA envelope resource
   */
  async read(uri: string): Promise<DdnaResourceResult> {
    // Parse URI
    const id = parseDdnaUri(uri);
    if (!id) {
      throw new DdnaResourceError(
        `Invalid DDNA URI: ${uri}`,
        DdnaResourceErrorCode.INVALID_URI
      );
    }

    // Load envelope from storage
    let envelope: DdnaEnvelope;
    try {
      envelope = await this.storage.load(id);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === StorageErrorCode.NOT_FOUND
      ) {
        throw new DdnaResourceError(
          `Envelope not found: ${id}`,
          DdnaResourceErrorCode.NOT_FOUND
        );
      }
      throw new DdnaResourceError(
        `Failed to load envelope: ${id}`,
        DdnaResourceErrorCode.STORAGE_ERROR
      );
    }

    // Verify signature before exposing
    const verification = await this.verifySignature(envelope);
    if (!verification.valid) {
      throw new DdnaResourceError(
        `Invalid envelope signature: ${verification.error}`,
        DdnaResourceErrorCode.INVALID_SIGNATURE
      );
    }

    // Check access permissions (based on embedded artifact)
    const authContext = this.getAuthContext();
    const accessCheck = canAccessEnvelope(envelope, authContext, 'export');

    if (!accessCheck.allowed) {
      throw new DdnaResourceError(
        `Access denied: ${accessCheck.reasons.join(', ')}`,
        DdnaResourceErrorCode.ACCESS_DENIED
      );
    }

    // Return resource
    return {
      uri,
      mimeType: DDNA_MIME_TYPE,
      text: JSON.stringify(envelope, null, 2),
    };
  }

  /**
   * List available DDNA envelope resources
   */
  async list(): Promise<DdnaResourceListItem[]> {
    const authContext = this.getAuthContext();
    const ids = await this.storage.list();

    const resources: DdnaResourceListItem[] = [];

    for (const id of ids) {
      try {
        const envelope = await this.storage.load(id);

        // Check if user can access this envelope
        const accessCheck = canAccessEnvelope(envelope, authContext, 'read');
        if (!accessCheck.allowed) {
          continue;
        }

        // Get artifact metadata for display
        const artifact = envelope.artifact;

        resources.push({
          uri: buildDdnaUri(id),
          name: artifact.meta.title || id,
          description: artifact.meta.description,
          mimeType: DDNA_MIME_TYPE,
          signer: envelope.signature.signer_did,
          sealedAt: envelope.sealed_at,
        });
      } catch {
        // Skip envelopes that fail to load
        continue;
      }
    }

    return resources;
  }

  /**
   * Check if a URI matches this provider
   */
  static matches(uri: string): boolean {
    return uri.startsWith(DDNA_URI_PREFIX);
  }
}

/**
 * Resource list item
 */
export interface DdnaResourceListItem {
  uri: string;
  name: string;
  description?: string;
  mimeType: string;
  signer?: string;
  sealedAt?: string;
}

/**
 * Create resource templates for MCP server
 */
export function getDdnaResourceTemplates() {
  return [
    {
      uriTemplate: 'ddna://envelope/{id}',
      name: 'DDNA Envelope',
      description: 'Read a sealed DDNA envelope by ID',
      mimeType: DDNA_MIME_TYPE,
    },
  ];
}
