/**
 * DeepaData API Client
 *
 * Thin wrapper around DeepaData.com API endpoints for sealing EDM artifacts.
 * Follows the VitaPass SDK thin-client pattern.
 */

/**
 * Client configuration
 */
export interface DeepaDataClientConfig {
  /** API key with 'issue' scope */
  apiKey: string;
  /** Base URL (defaults to https://deepadata.com) */
  baseUrl?: string;
}

/**
 * Issue request payload
 */
export interface IssueRequest {
  /** The EDM artifact to seal */
  artifact: object;
  /** Issuance pathway */
  pathway: 'subject' | 'delegated' | 'retrospective';
  /** Authority identifier (e.g., 'app:your-platform' or 'mcp:edm-server') */
  authority: string;
  /** Optional external reference for subject */
  subject_ref?: string;
  /** Optional VitaPass ID */
  subject_vp_id?: string;
  /** Source attribution for billing analytics */
  source?: string;
}

/**
 * Issue response from API
 */
export interface IssueResponse {
  success: boolean;
  data?: {
    envelope: object;
    certificate_id: string;
    certification_level: 'basic' | 'standard' | 'full';
    issuance: {
      pathway: string;
      authority: string;
      timestamp: string;
      issuer_did: string;
    };
    vitapass?: {
      vp_id: string;
      created: boolean;
    };
  };
  error?: {
    message: string;
    code: number;
  };
}

/**
 * Verify request payload
 */
export interface VerifyRequest {
  /** The .ddna envelope to verify */
  envelope: object;
}

/**
 * Verify response from API
 */
export interface VerifyResponse {
  success: boolean;
  data?: {
    verified: boolean;
    certification: {
      level: 'basic' | 'standard' | 'full';
      checks: Record<string, boolean>;
    };
    signer: {
      did: string;
      verification_method: string;
    };
  };
  error?: {
    message: string;
    code: number;
  };
}

/**
 * DeepaData API Client
 *
 * Provides access to DeepaData certification authority services.
 */
export class DeepaDataClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: DeepaDataClientConfig) {
    if (!config.apiKey) {
      throw new Error('DeepaData API key is required');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl?.replace(/\/$/, '') || 'https://deepadata.com';
  }

  /**
   * Issue (seal) an EDM artifact via DeepaData API
   *
   * Creates a certified .ddna envelope with registry entry.
   */
  async issue(request: IssueRequest): Promise<IssueResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/issue`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...request, source: 'mcp' }),
    });

    const data = await response.json() as IssueResponse;

    if (!response.ok) {
      return {
        success: false,
        error: {
          message: data.error?.message || `HTTP ${response.status}`,
          code: response.status,
        },
      };
    }

    return data;
  }

  /**
   * Verify a .ddna envelope via DeepaData API
   *
   * Verifies signature and checks certificate registry.
   */
  async verify(request: VerifyRequest): Promise<VerifyResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    const data = await response.json() as VerifyResponse;

    if (!response.ok) {
      return {
        success: false,
        error: {
          message: data.error?.message || `HTTP ${response.status}`,
          code: response.status,
        },
      };
    }

    return data;
  }
}

/**
 * Create a DeepaData client from environment variables
 */
export function createClientFromEnv(): DeepaDataClient | null {
  const apiKey = process.env.DEEPADATA_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new DeepaDataClient({
    apiKey,
    baseUrl: process.env.DEEPADATA_API_URL,
  });
}
