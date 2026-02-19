/**
 * seal_artifact Tool
 *
 * Seal EDM artifact into a .ddna envelope via DeepaData API.
 * Creates a certified envelope with registry entry.
 */

import type {
  EdmArtifact,
  DdnaEnvelope,
  EnvelopeStorage,
  AuthContext,
} from '../types.js';
import { canExport, validateGovernance } from '../security/governance.js';
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
        description: 'The EDM artifact to seal',
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
  envelope: DdnaEnvelope;
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
    artifact: EdmArtifact;
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

    const envelope = response.data.envelope as DdnaEnvelope;

    // Optionally save to local storage
    let savedId: string | undefined;
    if (args.save && this.storage) {
      try {
        savedId = await this.storage.save(envelope);
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
