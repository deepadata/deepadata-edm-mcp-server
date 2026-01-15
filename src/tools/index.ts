/**
 * Tools module exports
 */

export {
  ExtractToolHandler,
  ExtractionError,
  ExtractionErrorCode,
  extractToolDefinition,
  createExtractTool,
  type ExtractionResult,
  type ExtractFunction,
} from './extract.js';

export {
  SealToolHandler,
  SealError,
  SealErrorCode,
  sealToolDefinition,
  createSealTool,
  hexToKey,
  type SealResult,
  type SealFunction,
} from './seal.js';

export {
  ValidateToolHandler,
  validateToolDefinition,
  createValidateTool,
  isValidEdmArtifact,
  type ValidateFunction,
} from './validate.js';
