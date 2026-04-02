/**
 * deepadata_activate Tool
 *
 * Translate natural language memory queries into EDM significance field filters.
 * Use before querying your memory system to add a significance channel alongside semantic search.
 */

export const activateToolDefinition = {
  name: 'deepadata_activate',
  description:
    'Translate a natural language ' +
    'memory query into EDM significance ' +
    'field filters. Use before querying ' +
    'your memory system to add a ' +
    'significance channel alongside ' +
    'semantic search.',
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
      subject_vp_id: {
        type: 'string',
        description:
          'Optional VitaPass subject ID ' +
          'for personalised routing',
      },
      top_k: {
        type: 'number',
        description:
          'Number of results to target ' +
          '(default: 10)',
      },
    },
    required: ['query'],
  },
};

interface FieldFilter {
  field: string;
  operator: string;
  value: unknown;
  weight: number;
}

interface ActivateResult {
  arc_types: string[];
  primary_domain: string | null;
  field_filters: FieldFilter[];
  confidence: number;
  significance_gate: boolean;
  query: string;
  classifier_model: string;
  activated_at: string;
}

export class ActivateToolHandler {
  constructor(
    private readonly apiKey?: string,
    private readonly apiBaseUrl?: string
  ) {}

  async execute(args: {
    query: string;
    subject_vp_id?: string;
    top_k?: number;
  }): Promise<ActivateResult> {
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
      `${baseUrl}/api/v1/activate`,
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
          subject_vp_id:
            args.subject_vp_id,
          top_k: args.top_k ?? 10,
          source: 'mcp',
        }),
      }
    );

    if (!response.ok) {
      const error = await response
        .json().catch(() => ({}));
      throw new Error(
        `activate failed: ` +
        `${response.status} ` +
        `${JSON.stringify(error)}`
      );
    }

    const result = await response
      .json() as {
        data: {
          arc_types?: string[];
          primary_domain?: string | null;
          field_filters?: FieldFilter[];
          confidence?: number;
          significance_gate?: boolean;
        };
        meta?: {
          classifier_model?: string;
          activated_at?: string;
        };
      };
    return {
      arc_types:
        result.data.arc_types ?? [],
      primary_domain:
        result.data.primary_domain
        ?? null,
      field_filters:
        result.data.field_filters ?? [],
      confidence:
        result.data.confidence ?? 0,
      significance_gate:
        result.data.significance_gate
        ?? false,
      query: args.query,
      classifier_model:
        result.meta?.classifier_model
        ?? 'kimi-k2',
      activated_at:
        result.meta?.activated_at
        ?? new Date().toISOString(),
    };
  }
}

export function createActivateTool(
  apiKey?: string,
  apiBaseUrl?: string
) {
  const handler = new ActivateToolHandler(
    apiKey,
    apiBaseUrl
  );
  return {
    definition: activateToolDefinition,
    handler: (args: unknown) =>
      handler.execute(
        args as {
          query: string;
          subject_vp_id?: string;
          top_k?: number;
        }
      ),
  };
}
