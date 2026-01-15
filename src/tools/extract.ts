/**
 * extract_from_content Tool
 *
 * Extract EDM artifact from user content using AI extraction
 */

import type {
  EdmArtifact,
  ExtractionRequest,
  ArtifactStorage,
  AuthContext,
} from '../types.js';
import { applyDefaultGovernance } from '../security/governance.js';

/**
 * Tool definition for MCP
 */
export const extractToolDefinition = {
  name: 'extract_from_content',
  description:
    'Extract EDM artifact from text content and optional image. Returns structured data following the EDM v0.4.0 schema.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      text: {
        type: 'string',
        description: 'The text content to extract data from',
      },
      image: {
        type: 'string',
        description: 'Base64-encoded image data (optional)',
      },
      metadata: {
        type: 'object',
        description: 'Additional metadata to include in the artifact',
        additionalProperties: true,
      },
      contentType: {
        type: 'string',
        description: 'Type hint for the content being extracted',
      },
      save: {
        type: 'boolean',
        description: 'Whether to save the extracted artifact to storage',
        default: false,
      },
    },
    required: ['text'],
  },
};

/**
 * Extraction result
 */
export interface ExtractionResult {
  artifact: EdmArtifact;
  savedId?: string;
  extraction: {
    model?: string;
    confidence?: number;
    extracted_at: string;
  };
}

/**
 * Extraction error
 */
export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly code: ExtractionErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export enum ExtractionErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  EXTRACTION_FAILED = 'EXTRACTION_FAILED',
  STORAGE_FAILED = 'STORAGE_FAILED',
  API_ERROR = 'API_ERROR',
}

/**
 * Extract function type (to be provided by SDK)
 */
export type ExtractFunction = (
  request: ExtractionRequest
) => Promise<EdmArtifact>;

/**
 * Default placeholder extraction (for when SDK is not available)
 *
 * In production, this should be replaced by deepadata-edm-sdk extraction
 */
const defaultExtractor: ExtractFunction = async (
  request: ExtractionRequest
): Promise<EdmArtifact> => {
  const now = new Date().toISOString();
  const id = `edm_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;

  // Create a basic artifact structure from the input
  const artifact: EdmArtifact = {
    schema_version: '0.4.0',
    artifact_id: id,
    meta: {
      created_at: now,
      visibility: 'private',
      title: 'Extracted Content',
      description: `Extracted from ${request.content.text.substring(0, 50)}...`,
    },
    content: {
      type: 'extracted',
      data: {
        source_text: request.content.text,
        has_image: !!request.content.image,
        ...((request.metadata as Record<string, unknown>) || {}),
      },
    },
    provenance: {
      source: 'user-content',
      extraction_method: 'placeholder',
    },
    governance: {
      exportability: 'restricted',
    },
    extraction: {
      model: 'placeholder',
      extracted_at: now,
    },
  };

  return artifact;
};

/**
 * Extract tool handler class
 */
export class ExtractToolHandler {
  private readonly extractFn: ExtractFunction;

  constructor(
    private readonly storage: ArtifactStorage | null,
    private readonly getAuthContext: () => AuthContext | null,
    extractFn?: ExtractFunction
  ) {
    this.extractFn = extractFn || defaultExtractor;
  }

  /**
   * Execute extraction
   */
  async execute(args: {
    text: string;
    image?: string;
    metadata?: Record<string, unknown>;
    contentType?: string;
    save?: boolean;
  }): Promise<ExtractionResult> {
    // Validate input
    if (!args.text || args.text.trim().length === 0) {
      throw new ExtractionError(
        'Text content is required',
        ExtractionErrorCode.INVALID_INPUT
      );
    }

    // Build extraction request
    const request: ExtractionRequest = {
      content: {
        text: args.text,
        image: args.image,
      },
      metadata: args.metadata,
    };

    // Perform extraction
    let artifact: EdmArtifact;
    try {
      artifact = await this.extractFn(request);
    } catch (error) {
      throw new ExtractionError(
        'Extraction failed',
        ExtractionErrorCode.EXTRACTION_FAILED,
        error as Error
      );
    }

    // Apply default governance if needed
    artifact = applyDefaultGovernance(artifact);

    // Set owner from auth context
    const authContext = this.getAuthContext();
    if (authContext) {
      artifact.meta.owner_user_id = authContext.userId;
      artifact.meta.owner_org_id = authContext.organizationId;
    }

    // Optionally save to storage
    let savedId: string | undefined;
    if (args.save && this.storage) {
      try {
        savedId = await this.storage.save(artifact);
      } catch (error) {
        throw new ExtractionError(
          'Failed to save artifact',
          ExtractionErrorCode.STORAGE_FAILED,
          error as Error
        );
      }
    }

    return {
      artifact,
      savedId,
      extraction: {
        model: artifact.extraction?.model,
        confidence: artifact.extraction?.confidence,
        extracted_at: artifact.extraction?.extracted_at || new Date().toISOString(),
      },
    };
  }
}

/**
 * Create MCP tool handler
 */
export function createExtractTool(
  storage: ArtifactStorage | null,
  getAuthContext: () => AuthContext | null,
  extractFn?: ExtractFunction
) {
  const handler = new ExtractToolHandler(storage, getAuthContext, extractFn);

  return {
    definition: extractToolDefinition,
    handler: (args: unknown) =>
      handler.execute(args as Parameters<typeof handler.execute>[0]),
  };
}
