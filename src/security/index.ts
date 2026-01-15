/**
 * Security module exports
 */

export {
  canExport,
  isRestricted,
  isProhibited,
  checkVisibility,
  isExpired,
  canAccess,
  validateGovernance,
  applyDefaultGovernance,
  canAccessEnvelope,
  type AccessCheckResult,
  type GovernanceValidation,
} from './governance.js';

export {
  createNoAuthMiddleware,
  createTokenAuthMiddleware,
  createEnvTokenMiddleware,
  composeAuthMiddleware,
  withOrganizationHeader,
  createProviderMiddleware,
  createOAuth2Middleware,
  type AuthProvider,
  type OAuth2Config,
} from './middleware.js';
