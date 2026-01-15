/**
 * seal_artifact Tool
 *
 * Seal EDM artifact into a .ddna envelope with cryptographic signature
 */

import type {
  EdmArtifact,
  DdnaEnvelope,
  EnvelopeStorage,
  AuthContext,
} from '../types.js';
import { canExport, validateGovernance } from '../security/governance.js';

/**
 * Tool definition for MCP
 */
export const sealToolDefinition = {
  name: 'seal_artifact',
  description:
    'Seal an EDM artifact with a cryptographic signature, creating a .ddna envelope. Requires a private key and DID.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      artifact: {
        type: 'object',
        description: 'The EDM artifact to seal',
      },
      privateKey: {
        type: 'string',
        description: 'Hex-encoded private key for signing',
      },
      did: {
        type: 'string',
        description: 'DID (Decentralized Identifier) of the signer',
      },
      algorithm: {
        type: 'string',
        description: 'Signature algorithm to use',
        default: 'Ed25519',
      },
      save: {
        type: 'boolean',
        description: 'Whether to save the envelope to storage',
        default: false,
      },
    },
    required: ['artifact', 'privateKey', 'did'],
  },
};

/**
 * Seal result
 */
export interface SealResult {
  envelope: DdnaEnvelope;
  savedId?: string;
  warnings?: string[];
}

/**
 * Seal error
 */
export class SealError extends Error {
  constructor(
    message: string,
    public readonly code: SealErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'SealError';
  }
}

export enum SealErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  GOVERNANCE_VIOLATION = 'GOVERNANCE_VIOLATION',
  SIGNING_FAILED = 'SIGNING_FAILED',
  STORAGE_FAILED = 'STORAGE_FAILED',
  INVALID_KEY = 'INVALID_KEY',
}

/**
 * Seal function type (to be provided by ddna-tools)
 */
export type SealFunction = (
  artifact: EdmArtifact,
  privateKey: Uint8Array,
  did: string,
  algorithm?: string
) => Promise<DdnaEnvelope>;

/**
 * Convert hex string to Uint8Array
 */
export function hexToKey(hex: string): Uint8Array {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;

  // Validate hex string
  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new SealError('Invalid hex string', SealErrorCode.INVALID_KEY);
  }

  if (cleanHex.length % 2 !== 0) {
    throw new SealError(
      'Hex string must have even length',
      SealErrorCode.INVALID_KEY
    );
  }

  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }

  return bytes;
}

/**
 * Default placeholder seal function
 *
 * In production, this should be replaced by deepadata-ddna-tools seal
 */
const defaultSealer: SealFunction = async (
  artifact: EdmArtifact,
  _privateKey: Uint8Array,
  did: string,
  algorithm: string = 'Ed25519'
): Promise<DdnaEnvelope> => {
  const now = new Date().toISOString();

  // Create placeholder signature (NOT cryptographically secure)
  // In production, use actual cryptographic signing
  const signatureValue = Buffer.from(
    JSON.stringify({
      placeholder: true,
      artifact_id: artifact.artifact_id,
      timestamp: now,
    })
  ).toString('base64');

  return {
    version: '1.0',
    artifact,
    signature: {
      algorithm,
      signer_did: did,
      value: signatureValue,
    },
    sealed_at: now,
  };
};

/**
 * Seal tool handler class
 */
export class SealToolHandler {
  private readonly sealFn: SealFunction;

  constructor(
    private readonly storage: EnvelopeStorage | null,
    private readonly getAuthContext: () => AuthContext | null,
    sealFn?: SealFunction
  ) {
    this.sealFn = sealFn || defaultSealer;
  }

  /**
   * Execute sealing
   */
  async execute(args: {
    artifact: EdmArtifact;
    privateKey: string;
    did: string;
    algorithm?: string;
    save?: boolean;
  }): Promise<SealResult> {
    const warnings: string[] = [];

    // Validate artifact
    if (!args.artifact) {
      throw new SealError(
        'Artifact is required',
        SealErrorCode.INVALID_INPUT
      );
    }

    if (!args.artifact.artifact_id) {
      throw new SealError(
        'Artifact must have an artifact_id',
        SealErrorCode.INVALID_INPUT
      );
    }

    // Validate governance
    const govValidation = validateGovernance(args.artifact);
    if (!govValidation.valid) {
      throw new SealError(
        `Governance validation failed: ${govValidation.errors.join(', ')}`,
        SealErrorCode.GOVERNANCE_VIOLATION
      );
    }
    warnings.push(...govValidation.warnings);

    // Check exportability
    if (!canExport(args.artifact)) {
      throw new SealError(
        'Artifact is not exportable and cannot be sealed',
        SealErrorCode.GOVERNANCE_VIOLATION
      );
    }

    // Validate DID format
    if (!args.did || !args.did.startsWith('did:')) {
      throw new SealError(
        'Invalid DID format (must start with did:)',
        SealErrorCode.INVALID_INPUT
      );
    }

    // Parse private key
    let privateKeyBytes: Uint8Array;
    try {
      privateKeyBytes = hexToKey(args.privateKey);
    } catch (error) {
      throw new SealError(
        'Invalid private key format',
        SealErrorCode.INVALID_KEY,
        error as Error
      );
    }

    // Perform sealing
    let envelope: DdnaEnvelope;
    try {
      envelope = await this.sealFn(
        args.artifact,
        privateKeyBytes,
        args.did,
        args.algorithm
      );
    } catch (error) {
      throw new SealError(
        'Signing failed',
        SealErrorCode.SIGNING_FAILED,
        error as Error
      );
    }

    // Optionally save to storage
    let savedId: string | undefined;
    if (args.save && this.storage) {
      try {
        savedId = await this.storage.save(envelope);
      } catch (error) {
        throw new SealError(
          'Failed to save envelope',
          SealErrorCode.STORAGE_FAILED,
          error as Error
        );
      }
    }

    return {
      envelope,
      savedId,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

/**
 * Create MCP tool handler
 */
export function createSealTool(
  storage: EnvelopeStorage | null,
  getAuthContext: () => AuthContext | null,
  sealFn?: SealFunction
) {
  const handler = new SealToolHandler(storage, getAuthContext, sealFn);

  return {
    definition: sealToolDefinition,
    handler: (args: unknown) =>
      handler.execute(args as Parameters<typeof handler.execute>[0]),
  };
}
