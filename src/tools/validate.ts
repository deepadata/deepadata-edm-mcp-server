/**
 * validate_edm Tool
 *
 * Validate EDM artifact against schema and governance rules
 */

import type { EdmArtifact, ValidationResult, ValidationError, ValidationWarning } from '../types.js';
import { validateGovernance } from '../security/governance.js';

/**
 * Tool definition for MCP
 */
export const validateToolDefinition = {
  name: 'validate_edm',
  description:
    'Validate an EDM artifact against the v0.4.0 schema and governance rules. Returns validation errors and warnings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      artifact: {
        type: 'object',
        description: 'The EDM artifact to validate',
      },
      strict: {
        type: 'boolean',
        description: 'Enable strict validation mode',
        default: false,
      },
    },
    required: ['artifact'],
  },
};

/**
 * Validation function type (to be provided by SDK)
 */
export type ValidateFunction = (artifact: EdmArtifact) => ValidationResult;

/**
 * Default validator implementation
 */
const defaultValidator: ValidateFunction = (artifact: EdmArtifact): ValidationResult => {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check required top-level fields
  if (!artifact) {
    errors.push({
      path: '',
      message: 'Artifact is null or undefined',
      code: 'MISSING_ARTIFACT',
    });
    return { valid: false, errors, warnings };
  }

  if (!artifact.schema_version) {
    errors.push({
      path: 'schema_version',
      message: 'Missing required field: schema_version',
      code: 'MISSING_FIELD',
    });
  } else if (!artifact.schema_version.match(/^\d+\.\d+\.\d+$/)) {
    errors.push({
      path: 'schema_version',
      message: 'Invalid schema_version format (expected semver)',
      code: 'INVALID_FORMAT',
    });
  }

  if (!artifact.artifact_id) {
    errors.push({
      path: 'artifact_id',
      message: 'Missing required field: artifact_id',
      code: 'MISSING_FIELD',
    });
  }

  // Validate meta
  if (!artifact.meta) {
    errors.push({
      path: 'meta',
      message: 'Missing required field: meta',
      code: 'MISSING_FIELD',
    });
  } else {
    if (!artifact.meta.created_at) {
      errors.push({
        path: 'meta.created_at',
        message: 'Missing required field: meta.created_at',
        code: 'MISSING_FIELD',
      });
    } else if (isNaN(Date.parse(artifact.meta.created_at))) {
      errors.push({
        path: 'meta.created_at',
        message: 'Invalid ISO8601 date format',
        code: 'INVALID_FORMAT',
      });
    }

    if (!artifact.meta.visibility) {
      warnings.push({
        path: 'meta.visibility',
        message: 'Missing visibility, will default to private',
        code: 'MISSING_OPTIONAL',
      });
    } else if (!['public', 'private', 'shared'].includes(artifact.meta.visibility)) {
      errors.push({
        path: 'meta.visibility',
        message: 'Invalid visibility value',
        code: 'INVALID_VALUE',
      });
    }
  }

  // Validate content
  if (!artifact.content) {
    errors.push({
      path: 'content',
      message: 'Missing required field: content',
      code: 'MISSING_FIELD',
    });
  } else {
    if (!artifact.content.type) {
      errors.push({
        path: 'content.type',
        message: 'Missing required field: content.type',
        code: 'MISSING_FIELD',
      });
    }

    if (!artifact.content.data) {
      errors.push({
        path: 'content.data',
        message: 'Missing required field: content.data',
        code: 'MISSING_FIELD',
      });
    }
  }

  // Validate provenance
  if (!artifact.provenance) {
    errors.push({
      path: 'provenance',
      message: 'Missing required field: provenance',
      code: 'MISSING_FIELD',
    });
  } else {
    if (!artifact.provenance.source) {
      errors.push({
        path: 'provenance.source',
        message: 'Missing required field: provenance.source',
        code: 'MISSING_FIELD',
      });
    }
  }

  // Validate governance
  if (!artifact.governance) {
    errors.push({
      path: 'governance',
      message: 'Missing required field: governance',
      code: 'MISSING_FIELD',
    });
  } else {
    const govValidation = validateGovernance(artifact);
    for (const error of govValidation.errors) {
      errors.push({
        path: 'governance',
        message: error,
        code: 'GOVERNANCE_ERROR',
      });
    }
    for (const warning of govValidation.warnings) {
      warnings.push({
        path: 'governance',
        message: warning,
        code: 'GOVERNANCE_WARNING',
      });
    }
  }

  // Validate extraction metadata if present
  if (artifact.extraction) {
    if (!artifact.extraction.extracted_at) {
      warnings.push({
        path: 'extraction.extracted_at',
        message: 'Missing extraction timestamp',
        code: 'MISSING_OPTIONAL',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
};

/**
 * Validate tool handler class
 */
export class ValidateToolHandler {
  private readonly validateFn: ValidateFunction;

  constructor(validateFn?: ValidateFunction) {
    this.validateFn = validateFn || defaultValidator;
  }

  /**
   * Execute validation
   */
  async execute(args: {
    artifact: EdmArtifact;
    strict?: boolean;
  }): Promise<ValidationResult> {
    const result = this.validateFn(args.artifact);

    // In strict mode, treat warnings as errors
    if (args.strict && result.warnings && result.warnings.length > 0) {
      const warningErrors: ValidationError[] = result.warnings.map((w) => ({
        path: w.path,
        message: `[Strict] ${w.message}`,
        code: `STRICT_${w.code}`,
      }));

      return {
        valid: false,
        errors: [...result.errors, ...warningErrors],
        warnings: undefined,
      };
    }

    return result;
  }
}

/**
 * Create MCP tool handler
 */
export function createValidateTool(validateFn?: ValidateFunction) {
  const handler = new ValidateToolHandler(validateFn);

  return {
    definition: validateToolDefinition,
    handler: (args: unknown) =>
      handler.execute(args as Parameters<typeof handler.execute>[0]),
  };
}

/**
 * Quick validation helper
 */
export function isValidEdmArtifact(artifact: unknown): artifact is EdmArtifact {
  if (!artifact || typeof artifact !== 'object') {
    return false;
  }

  const a = artifact as Record<string, unknown>;
  return (
    typeof a.schema_version === 'string' &&
    typeof a.artifact_id === 'string' &&
    typeof a.meta === 'object' &&
    typeof a.content === 'object' &&
    typeof a.provenance === 'object' &&
    typeof a.governance === 'object'
  );
}
