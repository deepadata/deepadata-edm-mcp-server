/**
 * seal_artifact Tool
 *
 * Seal EDM artifact into a .ddna envelope via DeepaData API.
 * Creates a certified envelope with registry entry.
 */

import type {
  DdnaEnvelope,
  EnvelopeStorage,
  AuthContext,
} from '../types.js';
import { DeepaDataClient, type IssueResponse } from '../api/deepadata-client.js';

/**
 * Tool definition for MCP
 */
export const sealToolDefinition = {
  name: 'seal_artifact',
  description:
    'Seal an EDM artifact via DeepaData API, creating a certified .ddna envelope with registry entry. Requires DEEPADATA_API_KEY environment variable.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      artifact: {
        type: 'object',
        description:
          'The EDM artifact to seal (spec shape: meta + core domains, meta.version set). Passed to the platform verbatim.',
      },
      pathway: {
        type: 'string',
        enum: ['subject', 'delegated', 'retrospective'],
        description: 'Issuance pathway (default: delegated)',
        default: 'delegated',
      },
      authority: {
        type: 'string',
        description: 'Authority identifier (e.g., "app:your-platform"). Defaults to "mcp:edm-server"',
      },
      save: {
        type: 'boolean',
        description: 'Whether to save the envelope to local storage',
        default: false,
      },
    },
    required: ['artifact'],
  },
};

/**
 * Seal result
 */
export interface SealResult {
  /** The .ddna envelope exactly as issued by the platform (lib/ddna shape). */
  envelope: object;
  certificate_id?: string;
  certification_level?: string;
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
  API_ERROR = 'API_ERROR',
  API_KEY_MISSING = 'API_KEY_MISSING',
  STORAGE_FAILED = 'STORAGE_FAILED',
}

/**
 * Seal tool handler class
 */
export class SealToolHandler {
  private readonly client: DeepaDataClient | null;

  constructor(
    private readonly storage: EnvelopeStorage | null,
    private readonly getAuthContext: () => AuthContext | null,
    apiKey?: string,
    apiBaseUrl?: string
  ) {
    if (apiKey) {
      this.client = new DeepaDataClient({
        apiKey,
        baseUrl: apiBaseUrl,
      });
    } else {
      this.client = null;
    }
  }

  /**
   * Execute sealing via DeepaData API
   */
  async execute(args: {
    artifact: object;
    pathway?: 'subject' | 'delegated' | 'retrospective';
    authority?: string;
    save?: boolean;
  }): Promise<SealResult> {
    const warnings: string[] = [];

    // Check API key availability
    if (!this.client) {
      throw new SealError(
        'DeepaData API key required for sealing. Set DEEPADATA_API_KEY environment variable.',
        SealErrorCode.API_KEY_MISSING
      );
    }

    // Validate artifact shape against what the sealing authority accepts:
    // the platform's seal() requires the EDM spec shape — meta + core
    // domains with meta.version set. The artifact is forwarded verbatim,
    // so anything beyond that (jurisdiction, retention, consent,
    // certification level) is the platform's call at issue time.
    if (!args.artifact || typeof args.artifact !== 'object') {
      throw new SealError(
        'Artifact is required',
        SealErrorCode.INVALID_INPUT
      );
    }

    const artifact = args.artifact as Record<string, unknown>;
    const meta = artifact.meta as Record<string, unknown> | undefined;

    if (!meta || typeof meta !== 'object') {
      throw new SealError(
        "Artifact must have a 'meta' domain (EDM spec shape). Legacy artifacts without meta/core domains cannot be sealed by the platform.",
        SealErrorCode.INVALID_INPUT
      );
    }

    if (!meta.version || typeof meta.version !== 'string') {
      throw new SealError(
        "Artifact must have 'meta.version' — the platform refuses to seal a payload without its EDM version.",
        SealErrorCode.INVALID_INPUT
      );
    }

    if (!artifact.core || typeof artifact.core !== 'object') {
      throw new SealError(
        "Artifact must have a 'core' domain (EDM spec shape).",
        SealErrorCode.INVALID_INPUT
      );
    }

    // Export prohibition is the one governance rule enforced locally.
    // Spec vocabulary is 'forbidden' (edm-spec governance fragment);
    // 'prohibited' is the legacy spelling.
    const governance = artifact.governance as Record<string, unknown> | undefined;
    const exportability = governance?.exportability;
    if (exportability === 'forbidden' || exportability === 'prohibited') {
      throw new SealError(
        'Artifact governance.exportability forbids export; it cannot be sealed.',
        SealErrorCode.GOVERNANCE_VIOLATION
      );
    }

    if (!governance) {
      warnings.push(
        "Artifact has no 'governance' domain; the platform will refuse Certified-level issuance."
      );
    }

    // Call DeepaData API
    let response: IssueResponse;
    try {
      response = await this.client.issue({
        artifact: args.artifact,
        pathway: args.pathway || 'delegated',
        authority: args.authority || 'mcp:edm-server',
      });
    } catch (error) {
      throw new SealError(
        `API request failed: ${error instanceof Error ? error.message : error}`,
        SealErrorCode.API_ERROR,
        error as Error
      );
    }

    if (!response.success || !response.data) {
      throw new SealError(
        response.error?.message || 'Sealing failed',
        SealErrorCode.API_ERROR
      );
    }

    const envelope = response.data.envelope;

    // Optionally save to local storage
    let savedId: string | undefined;
    if (args.save && this.storage) {
      try {
        savedId = await this.storage.save(envelope as DdnaEnvelope);
      } catch (error) {
        throw new SealError(
          'Failed to save envelope to local storage',
          SealErrorCode.STORAGE_FAILED,
          error as Error
        );
      }
    }

    return {
      envelope,
      certificate_id: response.data.certificate_id,
      certification_level: response.data.certification_level,
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
  apiKey?: string,
  apiBaseUrl?: string
) {
  const handler = new SealToolHandler(storage, getAuthContext, apiKey, apiBaseUrl);

  return {
    definition: sealToolDefinition,
    handler: (args: unknown) =>
      handler.execute(args as Parameters<typeof handler.execute>[0]),
  };
}
