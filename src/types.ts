/**
 * Type definitions for the EDM MCP Server
 */

/**
 * EDM Artifact structure (v0.4.0)
 */
export interface EdmArtifact {
  schema_version: string;
  artifact_id: string;
  meta: ArtifactMeta;
  content: ArtifactContent;
  provenance: ArtifactProvenance;
  governance: ArtifactGovernance;
  extraction?: ExtractionMetadata;
}

export interface ArtifactMeta {
  created_at: string;
  updated_at?: string;
  visibility: 'public' | 'private' | 'shared';
  owner_user_id?: string;
  owner_org_id?: string;
  tags?: string[];
  title?: string;
  description?: string;
}

export interface ArtifactContent {
  type: string;
  data: Record<string, unknown>;
  format?: string;
}

export interface ArtifactProvenance {
  source: string;
  source_url?: string;
  extraction_method?: string;
  chain?: ProvenanceChainLink[];
}

export interface ProvenanceChainLink {
  timestamp: string;
  action: string;
  actor?: string;
  details?: Record<string, unknown>;
}

export interface ArtifactGovernance {
  exportability: 'allowed' | 'restricted' | 'prohibited';
  retention?: RetentionPolicy;
  classification?: string;
  compliance?: string[];
}

export interface RetentionPolicy {
  duration_days?: number;
  expires_at?: string;
  auto_delete?: boolean;
}

export interface ExtractionMetadata {
  model?: string;
  model_version?: string;
  prompt_hash?: string;
  confidence?: number;
  extracted_at: string;
}

/**
 * DDNA Envelope structure
 */
export interface DdnaEnvelope {
  version: string;
  artifact: EdmArtifact;
  signature: EnvelopeSignature;
  sealed_at: string;
}

export interface EnvelopeSignature {
  algorithm: string;
  signer_did: string;
  value: string;
  public_key?: string;
}

/**
 * Verification result
 */
export interface VerificationResult {
  valid: boolean;
  signer?: string;
  timestamp?: string;
  errors?: string[];
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings?: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
  code: string;
}

/**
 * Authentication context
 */
export interface AuthContext {
  userId: string;
  roles: string[];
  organizationId?: string;
  permissions?: string[];
}

/**
 * Server configuration
 */
export interface ServerConfig {
  name?: string;
  version?: string;
  storage?: StorageConfig;
  auth?: AuthMiddleware;
  anthropicApiKey?: string;
}

export interface StorageConfig {
  type: 'filesystem' | 's3' | 'database';
  path?: string;
  bucket?: string;
  region?: string;
  encryption?: boolean;
  connectionString?: string;
}

/**
 * Auth middleware type
 */
export type AuthMiddleware = (request: unknown) => Promise<AuthContext | null>;

/**
 * Storage interface
 */
export interface ArtifactStorage {
  load(id: string): Promise<EdmArtifact>;
  save(artifact: EdmArtifact): Promise<string>;
  list(filter?: StorageFilter): Promise<string[]>;
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
}

export interface EnvelopeStorage {
  load(id: string): Promise<DdnaEnvelope>;
  save(envelope: DdnaEnvelope): Promise<string>;
  list(filter?: StorageFilter): Promise<string[]>;
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
}

export interface StorageFilter {
  userId?: string;
  organizationId?: string;
  tags?: string[];
  visibility?: string;
  limit?: number;
  offset?: number;
}

/**
 * Extraction request
 */
export interface ExtractionRequest {
  content: {
    text: string;
    image?: string;
  };
  metadata?: Record<string, unknown>;
  options?: ExtractionOptions;
}

export interface ExtractionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Seal request
 */
export interface SealRequest {
  artifact: EdmArtifact;
  privateKey: string;
  did: string;
}
