/**
 * Authentication middleware interface for BYOA (Bring Your Own Auth)
 *
 * This module defines the interface for authentication middleware.
 * Organizations must provide their own implementation.
 */

import type { AuthContext, AuthMiddleware } from '../types.js';

/**
 * Create a no-auth middleware for local development/personal use
 *
 * WARNING: Only use this for local development or trusted environments.
 * Do NOT use in production without proper authentication.
 */
export function createNoAuthMiddleware(defaultUserId?: string): AuthMiddleware {
  return async (_request: unknown): Promise<AuthContext | null> => {
    // Return a default context for local development
    return {
      userId: defaultUserId || 'local-user',
      roles: ['user'],
    };
  };
}

/**
 * Create a middleware that requires a specific header token
 *
 * This is a simple example for demonstration. Production systems
 * should use proper JWT validation, OAuth, or similar.
 */
export function createTokenAuthMiddleware(
  validTokens: Map<string, AuthContext>
): AuthMiddleware {
  return async (request: unknown): Promise<AuthContext | null> => {
    // Extract token from request headers
    const headers = extractHeaders(request);
    const authHeader = headers['authorization'] || headers['x-auth-token'];

    if (!authHeader) {
      return null;
    }

    // Parse Bearer token
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    // Look up token
    return validTokens.get(token) || null;
  };
}

/**
 * Create a middleware that validates against environment variable
 */
export function createEnvTokenMiddleware(
  envVarName: string = 'EDM_AUTH_TOKEN'
): AuthMiddleware {
  const validToken = process.env[envVarName];

  return async (request: unknown): Promise<AuthContext | null> => {
    if (!validToken) {
      // If no token configured, allow all (local dev mode)
      console.warn(`Warning: ${envVarName} not set, running in open mode`);
      return {
        userId: 'anonymous',
        roles: ['user'],
      };
    }

    const headers = extractHeaders(request);
    const authHeader = headers['authorization'] || headers['x-auth-token'];

    if (!authHeader) {
      return null;
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (token === validToken) {
      return {
        userId: process.env['EDM_USER_ID'] || 'authenticated-user',
        roles: (process.env['EDM_USER_ROLES'] || 'user').split(','),
        organizationId: process.env['EDM_ORG_ID'],
      };
    }

    return null;
  };
}

/**
 * Compose multiple auth middlewares (try each in order)
 */
export function composeAuthMiddleware(
  middlewares: AuthMiddleware[]
): AuthMiddleware {
  return async (request: unknown): Promise<AuthContext | null> => {
    for (const middleware of middlewares) {
      const context = await middleware(request);
      if (context) {
        return context;
      }
    }
    return null;
  };
}

/**
 * Create middleware that adds organization context from headers
 */
export function withOrganizationHeader(
  baseMiddleware: AuthMiddleware,
  orgHeader: string = 'x-organization-id'
): AuthMiddleware {
  return async (request: unknown): Promise<AuthContext | null> => {
    const context = await baseMiddleware(request);
    if (!context) {
      return null;
    }

    const headers = extractHeaders(request);
    const orgId = headers[orgHeader.toLowerCase()];

    if (orgId) {
      return {
        ...context,
        organizationId: orgId,
      };
    }

    return context;
  };
}

/**
 * Helper to extract headers from various request formats
 */
function extractHeaders(request: unknown): Record<string, string> {
  if (!request || typeof request !== 'object') {
    return {};
  }

  const req = request as Record<string, unknown>;

  // Standard headers object
  if (req.headers && typeof req.headers === 'object') {
    const headers = req.headers as Record<string, unknown>;
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') {
        result[key.toLowerCase()] = value;
      } else if (Array.isArray(value) && value.length > 0) {
        result[key.toLowerCase()] = String(value[0]);
      }
    }

    return result;
  }

  // MCP-style params
  if (req.params && typeof req.params === 'object') {
    const params = req.params as Record<string, unknown>;
    if (params._meta && typeof params._meta === 'object') {
      const meta = params._meta as Record<string, unknown>;
      if (meta.headers && typeof meta.headers === 'object') {
        return meta.headers as Record<string, string>;
      }
    }
  }

  return {};
}

/**
 * Interface for custom auth provider implementations
 */
export interface AuthProvider {
  name: string;
  authenticate(request: unknown): Promise<AuthContext | null>;
  validateToken?(token: string): Promise<boolean>;
  refreshToken?(token: string): Promise<string | null>;
}

/**
 * Create middleware from an auth provider
 */
export function createProviderMiddleware(provider: AuthProvider): AuthMiddleware {
  return (request: unknown) => provider.authenticate(request);
}

/**
 * Example: Create OAuth2 middleware placeholder
 *
 * Organizations should implement this with their OAuth provider.
 */
export function createOAuth2Middleware(config: OAuth2Config): AuthMiddleware {
  // This is a placeholder - organizations must implement actual OAuth2 validation
  return async (request: unknown): Promise<AuthContext | null> => {
    const headers = extractHeaders(request);
    const authHeader = headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.slice(7);

    // In production, validate token with OAuth provider
    // This is just a placeholder that checks token format
    if (token.length < 10) {
      return null;
    }

    // Placeholder: In production, decode JWT or call introspection endpoint
    console.warn(
      'OAuth2 middleware is a placeholder. Implement proper token validation.'
    );

    return {
      userId: 'oauth-user',
      roles: ['user'],
      organizationId: config.defaultOrganization,
    };
  };
}

export interface OAuth2Config {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  audience?: string;
  defaultOrganization?: string;
}
