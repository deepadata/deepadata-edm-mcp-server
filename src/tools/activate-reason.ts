/**
 * deepadata_activate_reason Tool
 *
 * Wraps the platform /api/v1/activate_reason endpoint (ADR-0018).
 * Three-stage significance reasoning: classify query -> retrieve candidates
 * -> reasoning agent synthesises an answer with sources and fields_used.
 * Extends deepadata_activate with a reasoning step over the candidates.
 */

export const activateReasonToolDefinition = {
  name: 'deepadata_activate_reason',
  description:
    'Answer a natural language memory ' +
    'query by reasoning over EDM ' +
    'significance fields (ADR-0018). ' +
    'Classifies the query, retrieves ' +
    'candidate artifacts, and returns a ' +
    'synthesised answer with sources and ' +
    'the significance fields used.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description:
          'Natural language memory query ' +
          '(e.g. "when was I happiest ' +
          'with mum")',
      },
      namespace: {
        type: 'string',
        description:
          'Corpus namespace to query ' +
          '(REQUIRED by the platform ' +
          'API, e.g. user-<id>)',
      },
      subject_vp_id: {
        type: 'string',
        description:
          'Optional VitaPass subject ID ' +
          'for personalised routing',
      },
      top_k: {
        type: 'number',
        description:
          'Number of sources to return ' +
          '(default: 5, max: 20)',
      },
    },
    required: ['query', 'namespace'],
  },
};

interface ReasonSource {
  id: string;
  date?: string;
  narrative?: string;
  arc_type?: string | null;
  emotional_weight?: number;
  score?: number;
  [key: string]: unknown;
}

interface ActivateReasonResult {
  answer: string | null;
  sources: ReasonSource[];
  reasoning_fields_used: string[];
  arc_types: string[];
  confidence: number;
  significance_gate: boolean;
  candidate_count: number;
  query: string;
  reasoning_model: string;
  activated_at: string;
}

export class ActivateReasonToolHandler {
  constructor(
    private readonly apiKey?: string,
    private readonly apiBaseUrl?: string
  ) {}

  async execute(args: {
    query: string;
    namespace?: string;
    subject_vp_id?: string;
    top_k?: number;
  }): Promise<ActivateReasonResult> {
    const apiKey = this.apiKey
      ?? process.env.DEEPADATA_API_KEY;
    if (!apiKey) {
      throw new Error(
        'DEEPADATA_API_KEY is required'
      );
    }

    const baseUrl = this.apiBaseUrl
      ?? process.env.DEEPADATA_API_URL
      ?? 'https://deepadata.com';

    const response = await fetch(
      `${baseUrl}/api/v1/activate_reason`,
      {
        method: 'POST',
        headers: {
          'Authorization':
            `Bearer ${apiKey}`,
          'Content-Type':
            'application/json',
        },
        body: JSON.stringify({
          query: args.query,
          namespace: args.namespace,
          subject_vp_id:
            args.subject_vp_id,
          top_k: args.top_k,
          source: 'mcp',
        }),
      }
    );

    if (!response.ok) {
      const error = await response
        .json().catch(() => ({}));
      throw new Error(
        `activate_reason failed: ` +
        `${response.status} ` +
        `${JSON.stringify(error)}`
      );
    }

    const result = await response
      .json() as {
        data: {
          answer?: string | null;
          sources?: ReasonSource[];
          reasoning_fields_used?: string[];
          arc_types?: string[];
          confidence?: number;
          significance_gate?: boolean;
          candidate_count?: number;
        };
        meta?: {
          reasoning_model?: string;
          activated_at?: string;
        };
      };
    return {
      answer:
        result.data.answer ?? null,
      sources:
        result.data.sources ?? [],
      reasoning_fields_used:
        result.data.reasoning_fields_used
        ?? [],
      arc_types:
        result.data.arc_types ?? [],
      confidence:
        result.data.confidence ?? 0,
      significance_gate:
        result.data.significance_gate
        ?? false,
      candidate_count:
        result.data.candidate_count ?? 0,
      query: args.query,
      reasoning_model:
        result.meta?.reasoning_model
        ?? 'unknown',
      activated_at:
        result.meta?.activated_at
        ?? new Date().toISOString(),
    };
  }
}

export function createActivateReasonTool(
  apiKey?: string,
  apiBaseUrl?: string
) {
  const handler =
    new ActivateReasonToolHandler(
      apiKey,
      apiBaseUrl
    );
  return {
    definition:
      activateReasonToolDefinition,
    handler: (args: unknown) =>
      handler.execute(
        args as {
          query: string;
          namespace?: string;
          subject_vp_id?: string;
          top_k?: number;
        }
      ),
  };
}
