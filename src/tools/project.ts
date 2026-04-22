/**
 * edm_project Tool
 *
 * Project an EDM artifact into the canonical agent-consumable shape
 * defined in ADR-0009. Preserves governance properties for agent pipelines.
 */

import type { ArtifactStorage, AuthContext } from '../types.js';

/**
 * Tool definition for MCP
 */
export const projectToolDefinition = {
  name: 'edm_project',
  description:
    'Project an EDM artifact into the canonical agent-consumable shape (ADR-0009). Returns governance-preserving projection with optional LLM-generated context note.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      artifact_id: {
        type: 'string',
        description: 'The artifact ID to project',
      },
      context_note: {
        type: 'boolean',
        description:
          'Generate a 2-3 sentence LLM summary for context injection (default: false)',
        default: false,
      },
    },
    required: ['artifact_id'],
  },
};

/**
 * EDM Projection shape (ADR-0009 v1.0)
 */
export interface EdmProjection {
  edm_projection: '1.0';
  artifact_id: string;
  subject: string | null;
  captured_at: string;

  governance: {
    profile: 'essential' | 'extended' | 'full' | null;
    certification: 'compliant' | 'sealed' | 'certified' | null;
    sealed: boolean;
    ttl_expires_at: string | null;
    consent_basis: string | null;
    jurisdiction: string | null;
  };

  emotional_state: {
    primary_emotion: string | null;
    emotional_weight: number | null;
    valence: string | null;
    regulation_state: string | null;
    drive_state: string | null;
    narrative: string | null;
  };

  salience: {
    topics: string[];
    affect_shifts: string[];
    risk_signals: string[];
  };

  context_note: string | null;
}

/**
 * Project result
 */
export interface ProjectResult {
  projection: EdmProjection;
}

/**
 * Project error
 */
export class ProjectError extends Error {
  constructor(
    message: string,
    public readonly code: ProjectErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ProjectError';
  }
}

export enum ProjectErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  ARTIFACT_NOT_FOUND = 'ARTIFACT_NOT_FOUND',
  STORAGE_ERROR = 'STORAGE_ERROR',
  CONTEXT_NOTE_FAILED = 'CONTEXT_NOTE_FAILED',
}

/**
 * EDM artifact structure (minimal interface for projection)
 */
interface EdmArtifactForProjection {
  meta: {
    id: string | null;
    version?: string;
    profile: 'essential' | 'extended' | 'full';
    created_at: string;
    owner_user_id?: string | null;
    consent_basis?: string | null;
  };
  core?: {
    narrative?: string | null;
  };
  constellation?: {
    emotion_primary?: string | null;
  };
  gravity?: {
    emotional_weight?: number;
    valence?: string | null;
    recall_triggers?: string[];
    retrieval_keys?: string[];
    nearby_themes?: string[];
  };
  impulse?: {
    regulation_state?: string | null;
    drive_state?: string | null;
  };
  governance?: {
    jurisdiction?: string | null;
    retention_policy?: {
      ttl_days?: number | null;
    } | null;
  };
  milky_way?: {
    tone_shift?: string | null;
  };
}

/**
 * Generate context note using Kimi K2
 */
async function generateContextNote(
  artifact: EdmArtifactForProjection,
  apiKey: string
): Promise<string> {
  const prompt = `You are summarizing an emotional data artifact for an AI agent's context window.
Write 2-3 sentences that capture the emotional significance and key context.

Artifact data:
- Primary emotion: ${artifact.constellation?.emotion_primary || 'unknown'}
- Emotional weight: ${artifact.gravity?.emotional_weight || 'unknown'}
- Valence: ${artifact.gravity?.valence || 'unknown'}
- Narrative: ${artifact.core?.narrative || 'none provided'}
- Topics: ${artifact.gravity?.retrieval_keys?.join(', ') || 'none'}

Provide a concise, third-person summary suitable for agent context injection.`;

  const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'kimi-k2-0711-preview',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kimi API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0]?.message?.content?.trim() || '';
}

/**
 * Compute TTL expiry from retention policy
 */
function computeTtlExpiry(
  createdAt: string,
  ttlDays: number | null | undefined
): string | null {
  if (!ttlDays) return null;

  const created = new Date(createdAt);
  created.setDate(created.getDate() + ttlDays);
  return created.toISOString();
}

/**
 * Derive certification level from artifact state
 * This is a simplified inference - in production, check the registry
 */
function deriveCertification(
  _artifact: EdmArtifactForProjection
): 'compliant' | 'sealed' | 'certified' | null {
  // For MCP server projections, we can't determine certification
  // without checking the registry. Return null and let the API
  // populate this if needed.
  return null;
}

/**
 * Extract risk signals from artifact
 */
function extractRiskSignals(artifact: EdmArtifactForProjection): string[] {
  const signals: string[] = [];

  // High emotional weight is a risk signal
  if (
    artifact.gravity?.emotional_weight &&
    artifact.gravity.emotional_weight > 0.8
  ) {
    signals.push('high_emotional_intensity');
  }

  // Dysregulated state
  if (artifact.impulse?.regulation_state === 'dysregulated') {
    signals.push('dysregulated_state');
  }

  // Negative valence with high weight
  if (
    artifact.gravity?.valence === 'negative' &&
    artifact.gravity?.emotional_weight &&
    artifact.gravity.emotional_weight > 0.6
  ) {
    signals.push('negative_high_intensity');
  }

  return signals;
}

/**
 * Project tool handler class
 */
export class ProjectToolHandler {
  constructor(
    private readonly storage: ArtifactStorage | null,
    private readonly _getAuthContext: () => AuthContext | null,
    private readonly kimiApiKey?: string
  ) {}

  /**
   * Execute projection
   */
  async execute(args: {
    artifact_id: string;
    context_note?: boolean;
  }): Promise<ProjectResult> {
    // Validate input
    if (!args.artifact_id || args.artifact_id.trim().length === 0) {
      throw new ProjectError(
        'artifact_id is required',
        ProjectErrorCode.INVALID_INPUT
      );
    }

    // Check storage availability
    if (!this.storage) {
      throw new ProjectError(
        'Artifact storage not configured',
        ProjectErrorCode.STORAGE_ERROR
      );
    }

    // Load artifact from storage
    let artifact: EdmArtifactForProjection;
    try {
      const loaded = await this.storage.load(args.artifact_id);
      artifact = loaded as unknown as EdmArtifactForProjection;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes('not found')
      ) {
        throw new ProjectError(
          `Artifact not found: ${args.artifact_id}`,
          ProjectErrorCode.ARTIFACT_NOT_FOUND
        );
      }
      throw new ProjectError(
        `Failed to load artifact: ${error instanceof Error ? error.message : error}`,
        ProjectErrorCode.STORAGE_ERROR,
        error as Error
      );
    }

    // Build projection
    const projection: EdmProjection = {
      edm_projection: '1.0',
      artifact_id: artifact.meta.id || args.artifact_id,
      subject: artifact.meta.owner_user_id || null,
      captured_at: artifact.meta.created_at,

      governance: {
        profile: artifact.meta.profile || null,
        certification: deriveCertification(artifact),
        sealed: false, // MCP server cannot determine this without registry check
        ttl_expires_at: computeTtlExpiry(
          artifact.meta.created_at,
          artifact.governance?.retention_policy?.ttl_days
        ),
        consent_basis: artifact.meta.consent_basis || null,
        jurisdiction: artifact.governance?.jurisdiction || null,
      },

      emotional_state: {
        primary_emotion: artifact.constellation?.emotion_primary || null,
        emotional_weight: artifact.gravity?.emotional_weight ?? null,
        valence: artifact.gravity?.valence || null,
        regulation_state: artifact.impulse?.regulation_state || null,
        drive_state: artifact.impulse?.drive_state || null,
        narrative: artifact.core?.narrative || null,
      },

      salience: {
        topics: artifact.gravity?.retrieval_keys || [],
        affect_shifts: artifact.milky_way?.tone_shift
          ? [artifact.milky_way.tone_shift]
          : [],
        risk_signals: extractRiskSignals(artifact),
      },

      context_note: null,
    };

    // Generate context note if requested
    if (args.context_note) {
      const apiKey = this.kimiApiKey || process.env.KIMI_API_KEY || process.env.DEEPADATA_API_KEY;

      if (!apiKey) {
        throw new ProjectError(
          'Context note generation requires KIMI_API_KEY or DEEPADATA_API_KEY',
          ProjectErrorCode.CONTEXT_NOTE_FAILED
        );
      }

      try {
        projection.context_note = await generateContextNote(artifact, apiKey);
      } catch (error) {
        throw new ProjectError(
          `Failed to generate context note: ${error instanceof Error ? error.message : error}`,
          ProjectErrorCode.CONTEXT_NOTE_FAILED,
          error as Error
        );
      }
    }

    return { projection };
  }
}

/**
 * Create MCP tool handler
 */
export function createProjectTool(
  storage: ArtifactStorage | null,
  getAuthContext: () => AuthContext | null,
  kimiApiKey?: string
) {
  const handler = new ProjectToolHandler(storage, getAuthContext, kimiApiKey);

  return {
    definition: projectToolDefinition,
    handler: (args: unknown) =>
      handler.execute(args as Parameters<typeof handler.execute>[0]),
  };
}
