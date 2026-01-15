/**
 * Tests for auth middleware
 */

import {
  createNoAuthMiddleware,
  createTokenAuthMiddleware,
  createEnvTokenMiddleware,
  composeAuthMiddleware,
  withOrganizationHeader,
} from '../src/security/middleware.js';
import type { AuthContext } from '../src/types.js';

describe('Auth Middleware', () => {
  describe('createNoAuthMiddleware', () => {
    it('should return default user context', async () => {
      const middleware = createNoAuthMiddleware();
      const result = await middleware({});

      expect(result).toEqual({
        userId: 'local-user',
        roles: ['user'],
      });
    });

    it('should use custom user id', async () => {
      const middleware = createNoAuthMiddleware('custom-user');
      const result = await middleware({});

      expect(result?.userId).toBe('custom-user');
    });
  });

  describe('createTokenAuthMiddleware', () => {
    const tokens = new Map<string, AuthContext>([
      ['valid-token-1', { userId: 'user-1', roles: ['admin'] }],
      ['valid-token-2', { userId: 'user-2', roles: ['user'], organizationId: 'org-1' }],
    ]);

    it('should authenticate valid Bearer token', async () => {
      const middleware = createTokenAuthMiddleware(tokens);
      const result = await middleware({
        headers: { authorization: 'Bearer valid-token-1' },
      });

      expect(result).toEqual({ userId: 'user-1', roles: ['admin'] });
    });

    it('should authenticate valid x-auth-token', async () => {
      const middleware = createTokenAuthMiddleware(tokens);
      const result = await middleware({
        headers: { 'x-auth-token': 'valid-token-2' },
      });

      expect(result).toEqual({
        userId: 'user-2',
        roles: ['user'],
        organizationId: 'org-1',
      });
    });

    it('should return null for missing token', async () => {
      const middleware = createTokenAuthMiddleware(tokens);
      const result = await middleware({});

      expect(result).toBeNull();
    });

    it('should return null for invalid token', async () => {
      const middleware = createTokenAuthMiddleware(tokens);
      const result = await middleware({
        headers: { authorization: 'Bearer invalid-token' },
      });

      expect(result).toBeNull();
    });
  });

  describe('createEnvTokenMiddleware', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should authenticate when token matches env', async () => {
      process.env.EDM_AUTH_TOKEN = 'secret-token';
      process.env.EDM_USER_ID = 'env-user';
      process.env.EDM_USER_ROLES = 'admin,user';
      process.env.EDM_ORG_ID = 'env-org';

      const middleware = createEnvTokenMiddleware();
      const result = await middleware({
        headers: { authorization: 'Bearer secret-token' },
      });

      expect(result).toEqual({
        userId: 'env-user',
        roles: ['admin', 'user'],
        organizationId: 'env-org',
      });
    });

    it('should return null when token does not match', async () => {
      process.env.EDM_AUTH_TOKEN = 'secret-token';

      const middleware = createEnvTokenMiddleware();
      const result = await middleware({
        headers: { authorization: 'Bearer wrong-token' },
      });

      expect(result).toBeNull();
    });

    it('should allow all when no token configured', async () => {
      delete process.env.EDM_AUTH_TOKEN;

      const middleware = createEnvTokenMiddleware();
      const result = await middleware({});

      expect(result).toEqual({
        userId: 'anonymous',
        roles: ['user'],
      });
    });
  });

  describe('composeAuthMiddleware', () => {
    it('should try middlewares in order', async () => {
      const middleware1 = async () => null;
      const middleware2 = async () => ({ userId: 'from-second', roles: ['user'] });
      const middleware3 = async () => ({ userId: 'from-third', roles: ['user'] });

      const composed = composeAuthMiddleware([middleware1, middleware2, middleware3]);
      const result = await composed({});

      expect(result?.userId).toBe('from-second');
    });

    it('should return null if all fail', async () => {
      const middleware1 = async () => null;
      const middleware2 = async () => null;

      const composed = composeAuthMiddleware([middleware1, middleware2]);
      const result = await composed({});

      expect(result).toBeNull();
    });

    it('should short-circuit on first success', async () => {
      const calls: string[] = [];

      const middleware1 = async () => {
        calls.push('first');
        return { userId: 'user-1', roles: ['user'] };
      };
      const middleware2 = async () => {
        calls.push('second');
        return { userId: 'user-2', roles: ['user'] };
      };

      const composed = composeAuthMiddleware([middleware1, middleware2]);
      await composed({});

      expect(calls).toEqual(['first']);
    });
  });

  describe('withOrganizationHeader', () => {
    it('should add organization from header', async () => {
      const baseMiddleware = async () => ({ userId: 'user-1', roles: ['user'] });
      const middleware = withOrganizationHeader(baseMiddleware);

      const result = await middleware({
        headers: { 'x-organization-id': 'org-from-header' },
      });

      expect(result?.organizationId).toBe('org-from-header');
    });

    it('should preserve existing context', async () => {
      const baseMiddleware = async () => ({
        userId: 'user-1',
        roles: ['admin', 'user'],
      });
      const middleware = withOrganizationHeader(baseMiddleware);

      const result = await middleware({
        headers: { 'x-organization-id': 'org-1' },
      });

      expect(result).toEqual({
        userId: 'user-1',
        roles: ['admin', 'user'],
        organizationId: 'org-1',
      });
    });

    it('should return null if base middleware fails', async () => {
      const baseMiddleware = async () => null;
      const middleware = withOrganizationHeader(baseMiddleware);

      const result = await middleware({
        headers: { 'x-organization-id': 'org-1' },
      });

      expect(result).toBeNull();
    });

    it('should use custom header name', async () => {
      const baseMiddleware = async () => ({ userId: 'user-1', roles: ['user'] });
      const middleware = withOrganizationHeader(baseMiddleware, 'x-tenant-id');

      const result = await middleware({
        headers: { 'x-tenant-id': 'tenant-123' },
      });

      expect(result?.organizationId).toBe('tenant-123');
    });
  });
});
