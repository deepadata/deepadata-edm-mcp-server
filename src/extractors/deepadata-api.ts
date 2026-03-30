/**
 * DeepaData API Extractor
 *
 * Calls the hosted DeepaData /api/v1/extract endpoint for real AI extraction.
 * This replaces the placeholder extraction in extract.ts.
 */

import type { ExtractionRequest, EdmArtifact } from '../types.js';
import type { ExtractFunction } from '../tools/extract.js';

/**
 * Extract response from DeepaData API
 */
interface ExtractResponse {
  success: boolean;
  data?: EdmArtifact;
  meta?: {
    version: string;
    extracted_at: string;
    latency_ms: number;
    stateless: boolean;
  };
  error?: {
    message: string;
    code: number;
  };
}

/**
 * DeepaData API extractor configuration
 */
export interface DeepaDataExtractorConfig {
  /** API key with 'extract' scope */
  apiKey: string;
  /** Base URL (defaults to https://deepadata.com) */
  baseUrl?: string;
  /** Default extraction profile */
  defaultProfile?: 'essential' | 'extended' | 'full';
}

/**
 * Create an ExtractFunction that calls the DeepaData hosted API
 *
 * @param config - API configuration
 * @returns ExtractFunction compatible with MCP extract tool
 */
export function createDeepaDataExtractor(
  config: DeepaDataExtractorConfig
): ExtractFunction {
  const baseUrl = config.baseUrl?.replace(/\/$/, '') || 'https://deepadata.com';

  return async (request: ExtractionRequest): Promise<EdmArtifact> => {
    // Build request body matching /api/v1/extract expected shape
    const body: Record<string, unknown> = {
      content: request.content.text,
    };

    // Optional image
    if (request.content.image) {
      body.image = request.content.image;
    }

    // Map metadata fields
    if (request.metadata) {
      const meta = request.metadata as Record<string, unknown>;
      if (meta.profile) body.profile = meta.profile;
      if (meta.provider) body.provider = meta.provider;
      if (meta.model) body.model = meta.model;
      if (meta.temperature) body.temperature = meta.temperature;
      if (meta.jurisdiction) body.jurisdiction = meta.jurisdiction;
      if (meta.consentBasis) body.consent_basis = meta.consentBasis;
      if (meta.parentId) body.parent_id = meta.parentId;
      if (meta.tags) body.tags = meta.tags;
      if (meta.visibility) body.visibility = meta.visibility;
      if (meta.piiTier) body.pii_tier = meta.piiTier;
      if (meta.locale) body.locale = meta.locale;
      if (meta.sourceContext) body.source_context = meta.sourceContext;
      if (meta.consentScope) body.consent_scope = meta.consentScope;
      if (meta.ownerId) body.owner_user_id = meta.ownerId;
      if (meta.exportability) body.exportability = meta.exportability;
      if (meta.retentionDays) body.retention_days = meta.retentionDays;
    }

    // Apply default profile if not specified
    if (!body.profile && config.defaultProfile) {
      body.profile = config.defaultProfile;
    }

    const response = await fetch(`${baseUrl}/api/v1/extract`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as ExtractResponse;

    if (!response.ok || !data.success || !data.data) {
      const errorMessage = data.error?.message || `HTTP ${response.status}`;
      throw new Error(`DeepaData extraction failed: ${errorMessage}`);
    }

    return data.data;
  };
}

/**
 * Create extractor from environment variables
 *
 * Reads DEEPADATA_API_KEY and DEEPADATA_API_URL from environment.
 * Returns null if API key is not configured.
 */
export function createExtractorFromEnv(): ExtractFunction | null {
  const apiKey = process.env.DEEPADATA_API_KEY;
  if (!apiKey) {
    return null;
  }

  return createDeepaDataExtractor({
    apiKey,
    baseUrl: process.env.DEEPADATA_API_URL,
  });
}
