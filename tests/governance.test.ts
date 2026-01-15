/**
 * Tests for governance enforcement
 */

import {
  canExport,
  isRestricted,
  isProhibited,
  checkVisibility,
  isExpired,
  canAccess,
  validateGovernance,
  applyDefaultGovernance,
} from '../src/security/governance.js';
import type { EdmArtifact, AuthContext } from '../src/types.js';

describe('Governance', () => {
  // Helper to create test artifacts
  const createArtifact = (overrides: Partial<EdmArtifact> = {}): EdmArtifact => ({
    schema_version: '0.4.0',
    artifact_id: 'test-artifact-1',
    meta: {
      created_at: new Date().toISOString(),
      visibility: 'private',
      owner_user_id: 'user-1',
      ...overrides.meta,
    },
    content: {
      type: 'test',
      data: {},
      ...overrides.content,
    },
    provenance: {
      source: 'test',
      ...overrides.provenance,
    },
    governance: {
      exportability: 'allowed',
      ...overrides.governance,
    },
    ...overrides,
  });

  describe('canExport', () => {
    it('should return true when exportability is allowed', () => {
      const artifact = createArtifact({
        governance: { exportability: 'allowed' },
      });
      expect(canExport(artifact)).toBe(true);
    });

    it('should return false when exportability is restricted', () => {
      const artifact = createArtifact({
        governance: { exportability: 'restricted' },
      });
      expect(canExport(artifact)).toBe(false);
    });

    it('should return false when exportability is prohibited', () => {
      const artifact = createArtifact({
        governance: { exportability: 'prohibited' },
      });
      expect(canExport(artifact)).toBe(false);
    });
  });

  describe('isRestricted / isProhibited', () => {
    it('should identify restricted artifacts', () => {
      const artifact = createArtifact({
        governance: { exportability: 'restricted' },
      });
      expect(isRestricted(artifact)).toBe(true);
      expect(isProhibited(artifact)).toBe(false);
    });

    it('should identify prohibited artifacts', () => {
      const artifact = createArtifact({
        governance: { exportability: 'prohibited' },
      });
      expect(isRestricted(artifact)).toBe(false);
      expect(isProhibited(artifact)).toBe(true);
    });
  });

  describe('checkVisibility', () => {
    it('should allow public artifacts without auth', () => {
      const artifact = createArtifact({
        meta: { created_at: new Date().toISOString(), visibility: 'public' },
      });
      expect(checkVisibility(artifact, null)).toBe(true);
    });

    it('should deny private artifacts without auth', () => {
      const artifact = createArtifact({
        meta: {
          created_at: new Date().toISOString(),
          visibility: 'private',
          owner_user_id: 'user-1',
        },
      });
      expect(checkVisibility(artifact, null)).toBe(false);
    });

    it('should allow private artifacts to owner', () => {
      const artifact = createArtifact({
        meta: {
          created_at: new Date().toISOString(),
          visibility: 'private',
          owner_user_id: 'user-1',
        },
      });
      const context: AuthContext = { userId: 'user-1', roles: ['user'] };
      expect(checkVisibility(artifact, context)).toBe(true);
    });

    it('should deny private artifacts to non-owner', () => {
      const artifact = createArtifact({
        meta: {
          created_at: new Date().toISOString(),
          visibility: 'private',
          owner_user_id: 'user-1',
        },
      });
      const context: AuthContext = { userId: 'user-2', roles: ['user'] };
      expect(checkVisibility(artifact, context)).toBe(false);
    });

    it('should allow shared artifacts to organization members', () => {
      const artifact = createArtifact({
        meta: {
          created_at: new Date().toISOString(),
          visibility: 'shared',
          owner_user_id: 'user-1',
          owner_org_id: 'org-1',
        },
      });
      const context: AuthContext = {
        userId: 'user-2',
        roles: ['user'],
        organizationId: 'org-1',
      };
      expect(checkVisibility(artifact, context)).toBe(true);
    });

    it('should deny shared artifacts to non-org members', () => {
      const artifact = createArtifact({
        meta: {
          created_at: new Date().toISOString(),
          visibility: 'shared',
          owner_user_id: 'user-1',
          owner_org_id: 'org-1',
        },
      });
      const context: AuthContext = {
        userId: 'user-2',
        roles: ['user'],
        organizationId: 'org-2',
      };
      expect(checkVisibility(artifact, context)).toBe(false);
    });
  });

  describe('isExpired', () => {
    it('should return false when no retention policy', () => {
      const artifact = createArtifact();
      expect(isExpired(artifact)).toBe(false);
    });

    it('should return false when not expired', () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      const artifact = createArtifact({
        governance: {
          exportability: 'allowed',
          retention: { expires_at: future },
        },
      });
      expect(isExpired(artifact)).toBe(false);
    });

    it('should return true when expired by expires_at', () => {
      const past = new Date(Date.now() - 86400000).toISOString();
      const artifact = createArtifact({
        governance: {
          exportability: 'allowed',
          retention: { expires_at: past },
        },
      });
      expect(isExpired(artifact)).toBe(true);
    });

    it('should return true when expired by duration_days', () => {
      const oldDate = new Date(Date.now() - 10 * 86400000).toISOString();
      const artifact = createArtifact({
        meta: {
          created_at: oldDate,
          visibility: 'private',
        },
        governance: {
          exportability: 'allowed',
          retention: { duration_days: 5 },
        },
      });
      expect(isExpired(artifact)).toBe(true);
    });
  });

  describe('canAccess', () => {
    it('should deny access to expired artifacts', () => {
      const past = new Date(Date.now() - 86400000).toISOString();
      const artifact = createArtifact({
        governance: {
          exportability: 'allowed',
          retention: { expires_at: past },
        },
      });
      const result = canAccess(artifact, null, 'read');
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('Artifact has expired');
    });

    it('should deny export of prohibited artifacts', () => {
      const artifact = createArtifact({
        meta: { created_at: new Date().toISOString(), visibility: 'public' },
        governance: { exportability: 'prohibited' },
      });
      const result = canAccess(artifact, null, 'export');
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('Artifact export is prohibited');
    });

    it('should allow read of exportable, visible artifacts', () => {
      const artifact = createArtifact({
        meta: { created_at: new Date().toISOString(), visibility: 'public' },
        governance: { exportability: 'allowed' },
      });
      const result = canAccess(artifact, null, 'read');
      expect(result.allowed).toBe(true);
    });

    it('should require auth for modification', () => {
      const artifact = createArtifact({
        meta: { created_at: new Date().toISOString(), visibility: 'public' },
      });
      const result = canAccess(artifact, null, 'modify');
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('Authentication required for modification');
    });

    it('should allow owner to modify', () => {
      const artifact = createArtifact({
        meta: {
          created_at: new Date().toISOString(),
          visibility: 'private',
          owner_user_id: 'user-1',
        },
      });
      const context: AuthContext = { userId: 'user-1', roles: ['user'] };
      const result = canAccess(artifact, context, 'modify');
      expect(result.allowed).toBe(true);
    });

    it('should allow admin to modify any artifact', () => {
      const artifact = createArtifact({
        meta: {
          created_at: new Date().toISOString(),
          visibility: 'private',
          owner_user_id: 'user-1',
        },
      });
      const context: AuthContext = { userId: 'user-2', roles: ['admin'] };
      const result = canAccess(artifact, context, 'modify');
      expect(result.allowed).toBe(true);
    });
  });

  describe('validateGovernance', () => {
    it('should validate correct governance', () => {
      const artifact = createArtifact();
      const result = validateGovernance(artifact);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when governance is missing', () => {
      const artifact = createArtifact();
      (artifact as { governance?: unknown }).governance = undefined;
      const result = validateGovernance(artifact);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing governance field');
    });

    it('should fail when exportability is missing', () => {
      const artifact = createArtifact();
      (artifact.governance as { exportability?: unknown }).exportability = undefined;
      const result = validateGovernance(artifact);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing exportability setting');
    });

    it('should warn when visibility is missing', () => {
      const artifact = createArtifact();
      (artifact.meta as { visibility?: unknown }).visibility = undefined;
      const result = validateGovernance(artifact);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        'Missing visibility setting, defaulting to private'
      );
    });
  });

  describe('applyDefaultGovernance', () => {
    it('should apply default governance to partial artifact', () => {
      const partial = {
        artifact_id: 'test',
        schema_version: '0.4.0',
        content: { type: 'test', data: {} },
        provenance: { source: 'test' },
      };
      const result = applyDefaultGovernance(partial);
      expect(result.governance.exportability).toBe('restricted');
      expect(result.meta.visibility).toBe('private');
      expect(result.meta.created_at).toBeDefined();
    });

    it('should not override existing governance', () => {
      const partial = {
        artifact_id: 'test',
        schema_version: '0.4.0',
        content: { type: 'test', data: {} },
        provenance: { source: 'test' },
        governance: { exportability: 'allowed' as const },
      };
      const result = applyDefaultGovernance(partial);
      expect(result.governance.exportability).toBe('allowed');
    });
  });
});
