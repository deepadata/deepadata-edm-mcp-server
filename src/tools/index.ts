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
  type SealResult,
} from './seal.js';

export {
  ValidateToolHandler,
  validateToolDefinition,
  createValidateTool,
  isValidEdmArtifact,
  type ValidateFunction,
} from './validate.js';

export {
  ProjectToolHandler,
  ProjectError,
  ProjectErrorCode,
  projectToolDefinition,
  createProjectTool,
  type EdmProjection,
  type ProjectResult,
} from './project.js';

export {
  ActivateToolHandler,
  activateToolDefinition,
  createActivateTool,
} from './activate.js';

export {
  createWikiGenerateTool,
  createWikiSearchTool,
  createWikiLintTool,
  wikiGenerateToolDefinition,
  wikiSearchToolDefinition,
  wikiLintToolDefinition,
} from './wiki.js';
