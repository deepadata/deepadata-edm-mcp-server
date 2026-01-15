/**
 * Governance enforcement for EDM artifacts
 *
 * Enforces exportability, visibility, and access control rules
 * based on artifact governance fields.
 */

import type { EdmArtifact, AuthContext, DdnaEnvelope } from '../types.js';

/**
 * Check if an artifact can be exported (shared externally)
 */
export function canExport(artifact: EdmArtifact): boolean {
  return artifact.governance.exportability === 'allowed';
}

/**
 * Check if an artifact is restricted (limited sharing)
 */
export function isRestricted(artifact: EdmArtifact): boolean {
  return artifact.governance.exportability === 'restricted';
}

/**
 * Check if an artifact is prohibited from export
 */
export function isProhibited(artifact: EdmArtifact): boolean {
  return artifact.governance.exportability === 'prohibited';
}

/**
 * Check if a user can access an artifact based on visibility rules
 */
export function checkVisibility(
  artifact: EdmArtifact,
  context: AuthContext | null
): boolean {
  const visibility = artifact.meta.visibility;

  // Public artifacts are accessible to everyone
  if (visibility === 'public') {
    return true;
  }

  // Private and shared artifacts require authentication
  if (!context) {
    return false;
  }

  // Private artifacts are only accessible to the owner
  if (visibility === 'private') {
    return artifact.meta.owner_user_id === context.userId;
  }

  // Shared artifacts are accessible to organization members
  if (visibility === 'shared') {
    // Owner always has access
    if (artifact.meta.owner_user_id === context.userId) {
      return true;
    }

    // Organization members have access if in same org
    if (
      artifact.meta.owner_org_id &&
      context.organizationId === artifact.meta.owner_org_id
    ) {
      return true;
    }

    // Check if user has explicit permission
    if (context.permissions?.includes(`artifact:read:${artifact.artifact_id}`)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if artifact has expired based on retention policy
 */
export function isExpired(artifact: EdmArtifact): boolean {
  const retention = artifact.governance.retention;

  if (!retention) {
    return false;
  }

  if (retention.expires_at) {
    return new Date(retention.expires_at) < new Date();
  }

  if (retention.duration_days && artifact.meta.created_at) {
    const createdAt = new Date(artifact.meta.created_at);
    const expiresAt = new Date(
      createdAt.getTime() + retention.duration_days * 24 * 60 * 60 * 1000
    );
    return expiresAt < new Date();
  }

  return false;
}

/**
 * Comprehensive access check for artifact
 */
export function canAccess(
  artifact: EdmArtifact,
  context: AuthContext | null,
  purpose: 'read' | 'export' | 'modify' | 'delete' = 'read'
): AccessCheckResult {
  const result: AccessCheckResult = {
    allowed: false,
    reasons: [],
  };

  // Check expiration (applies to everyone, even admins)
  if (isExpired(artifact)) {
    result.reasons.push('Artifact has expired');
    return result;
  }

  // Check if user is admin (admins bypass most access controls)
  const isAdmin = context?.roles?.includes('admin') ?? false;

  // For modification/deletion, check ownership or admin status first
  if (purpose === 'modify' || purpose === 'delete') {
    if (!context) {
      result.reasons.push('Authentication required for modification');
      return result;
    }

    const isOwner = artifact.meta.owner_user_id === context.userId;

    if (!isOwner && !isAdmin) {
      result.reasons.push('Only owner or admin can modify/delete');
      return result;
    }

    // Owner or admin can modify/delete
    result.allowed = true;
    return result;
  }

  // For read/export, check visibility (admins bypass)
  if (!isAdmin && !checkVisibility(artifact, context)) {
    result.reasons.push('Visibility check failed');
    return result;
  }

  // For export purposes, check exportability
  if (purpose === 'export' && !canExport(artifact)) {
    if (isProhibited(artifact)) {
      result.reasons.push('Artifact export is prohibited');
    } else if (isRestricted(artifact)) {
      result.reasons.push('Artifact export is restricted');
    }
    return result;
  }

  // All checks passed for read/export
  result.allowed = true;
  return result;
}

/**
 * Access check result
 */
export interface AccessCheckResult {
  allowed: boolean;
  reasons: string[];
}

/**
 * Validate governance fields are properly set
 */
export function validateGovernance(artifact: EdmArtifact): GovernanceValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required governance field
  if (!artifact.governance) {
    errors.push('Missing governance field');
    return { valid: false, errors, warnings };
  }

  // Check exportability
  if (!artifact.governance.exportability) {
    errors.push('Missing exportability setting');
  } else if (
    !['allowed', 'restricted', 'prohibited'].includes(
      artifact.governance.exportability
    )
  ) {
    errors.push('Invalid exportability value');
  }

  // Check visibility
  if (!artifact.meta?.visibility) {
    warnings.push('Missing visibility setting, defaulting to private');
  }

  // Check retention policy consistency
  if (artifact.governance.retention) {
    const retention = artifact.governance.retention;
    if (retention.duration_days && retention.expires_at) {
      warnings.push(
        'Both duration_days and expires_at set; expires_at takes precedence'
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export interface GovernanceValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Apply default governance to an artifact if missing
 */
export function applyDefaultGovernance(
  artifact: Partial<EdmArtifact>
): EdmArtifact {
  return {
    ...artifact,
    governance: {
      exportability: 'restricted',
      ...artifact.governance,
    },
    meta: {
      visibility: 'private',
      created_at: new Date().toISOString(),
      ...artifact.meta,
    },
  } as EdmArtifact;
}

/**
 * Check envelope governance (delegates to artifact governance)
 */
export function canAccessEnvelope(
  envelope: DdnaEnvelope,
  context: AuthContext | null,
  purpose: 'read' | 'export' = 'read'
): AccessCheckResult {
  return canAccess(envelope.artifact, context, purpose);
}
