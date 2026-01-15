# Security Documentation

This document describes the security architecture, BYOA (Bring Your Own Auth) model, and deployment security considerations for `deepadata-edm-mcp-server`.

## BYOA (Bring Your Own Auth) Model

The server implements a **BYOA** security model, meaning:

1. **The server provides the protocol layer** - MCP resources, tools, and transport
2. **You provide the authentication** - Auth middleware, token validation, identity management
3. **You provide the authorization context** - User roles, organization membership, permissions

This design allows the server to work in various security contexts without imposing a specific auth system.

### Why BYOA?

- **Flexibility:** Integrate with any identity provider (OAuth, SAML, JWT, custom)
- **No Lock-in:** No dependency on specific auth services
- **Enterprise Ready:** Works with existing organizational auth infrastructure
- **Simplicity:** Server code stays focused on MCP functionality

## Authentication Middleware

### Interface

```typescript
interface AuthContext {
  userId: string;
  roles: string[];
  organizationId?: string;
  permissions?: string[];
}

type AuthMiddleware = (request: unknown) => Promise<AuthContext | null>;
```

### Built-in Options

#### No Auth (Development Only)

```typescript
import { createNoAuthMiddleware } from 'deepadata-edm-mcp-server/security';

// WARNING: Never use in production
const auth = createNoAuthMiddleware('dev-user');
```

#### Environment Token

```typescript
import { createEnvTokenMiddleware } from 'deepadata-edm-mcp-server/security';

// Validates against EDM_AUTH_TOKEN env var
const auth = createEnvTokenMiddleware('EDM_AUTH_TOKEN');
```

#### Token Map

```typescript
import { createTokenAuthMiddleware } from 'deepadata-edm-mcp-server/security';

const tokens = new Map([
  ['secret-token-1', { userId: 'user1', roles: ['admin'] }],
  ['secret-token-2', { userId: 'user2', roles: ['user'] }],
]);

const auth = createTokenAuthMiddleware(tokens);
```

### Custom Implementation Examples

#### JWT Validation

```typescript
import jwt from 'jsonwebtoken';

const jwtAuth: AuthMiddleware = async (request) => {
  const headers = extractHeaders(request);
  const token = headers['authorization']?.replace('Bearer ', '');

  if (!token) return null;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      sub: string;
      roles: string[];
      org?: string;
    };

    return {
      userId: payload.sub,
      roles: payload.roles,
      organizationId: payload.org,
    };
  } catch {
    return null;
  }
};
```

#### OAuth2 Introspection

```typescript
const oauth2Auth: AuthMiddleware = async (request) => {
  const headers = extractHeaders(request);
  const token = headers['authorization']?.replace('Bearer ', '');

  if (!token) return null;

  // Call OAuth2 introspection endpoint
  const response = await fetch(process.env.OAUTH2_INTROSPECT_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: `token=${token}`,
  });

  const data = await response.json();

  if (!data.active) return null;

  return {
    userId: data.sub,
    roles: data.scope?.split(' ') || ['user'],
    organizationId: data.org_id,
  };
};
```

#### SAML Assertion

```typescript
const samlAuth: AuthMiddleware = async (request) => {
  const headers = extractHeaders(request);
  const assertion = headers['x-saml-assertion'];

  if (!assertion) return null;

  // Validate SAML assertion with your identity provider
  const result = await validateSamlAssertion(assertion);

  if (!result.valid) return null;

  return {
    userId: result.nameId,
    roles: result.attributes.roles || ['user'],
    organizationId: result.attributes.organization,
  };
};
```

## Governance Enforcement

### Exportability

The `governance.exportability` field controls whether artifacts can be shared:

| Value | Behavior |
|-------|----------|
| `allowed` | Artifact can be read via resources and sealed into envelopes |
| `restricted` | Artifact cannot be exported but can be read internally |
| `prohibited` | Artifact cannot be read via MCP resources at all |

### Visibility

The `meta.visibility` field controls who can access artifacts:

| Value | Behavior |
|-------|----------|
| `public` | Anyone can read (no auth required) |
| `private` | Only the owner can read |
| `shared` | Owner and organization members can read |

### Implementation

```typescript
import { canAccess } from 'deepadata-edm-mcp-server/security';

const result = canAccess(artifact, authContext, 'export');
// result: { allowed: boolean, reasons: string[] }
```

## Threat Model

### Assets

1. **EDM Artifacts** - May contain sensitive business data
2. **DDNA Envelopes** - Signed artifacts with cryptographic signatures
3. **Private Keys** - Used for signing envelopes
4. **Authentication Tokens** - Access credentials

### Threats

| Threat | Mitigation |
|--------|------------|
| Unauthorized access to artifacts | Auth middleware + governance enforcement |
| Artifact tampering | DDNA signatures for integrity |
| Key compromise | Bring your own key management |
| Data exfiltration | Exportability controls |
| Session hijacking | Use short-lived tokens, HTTPS |
| Privilege escalation | Role-based access, principle of least privilege |
| Injection attacks | Input validation, sanitized IDs |

### Trust Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                     Untrusted Zone                          │
│  ┌──────────────┐                                           │
│  │ AI Assistant │ ◄── External, potentially malicious       │
│  └──────┬───────┘                                           │
└─────────┼───────────────────────────────────────────────────┘
          │ MCP Protocol (stdio/HTTP)
          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Auth Middleware                           │
│              (Your implementation)                          │
│         Validates tokens, extracts identity                 │
└─────────┬───────────────────────────────────────────────────┘
          │ AuthContext
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Governance Enforcement                   │  │
│  │    Checks visibility, exportability, ownership        │  │
│  └─────────────────────┬─────────────────────────────────┘  │
│                        │                                    │
│  ┌─────────────────────▼─────────────────────────────────┐  │
│  │                   Storage                             │  │
│  │           (File system, S3, Database)                 │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Deployment Security Checklist

### Minimum Requirements

- [ ] **Authentication configured** - Non-trivial auth middleware
- [ ] **HTTPS/TLS enabled** - Encrypt transport (if using HTTP)
- [ ] **Storage encryption** - Encrypt at rest
- [ ] **Access logging** - Log all resource access and tool calls
- [ ] **Network isolation** - Private network or VPN

### Recommended

- [ ] **Token rotation** - Short-lived tokens with refresh
- [ ] **Rate limiting** - Prevent abuse
- [ ] **IP allowlisting** - Restrict source IPs
- [ ] **Audit trail** - Immutable access logs
- [ ] **Key management** - Use HSM or key vault for signing keys
- [ ] **Vulnerability scanning** - Regular dependency audits

### Enterprise

- [ ] **SOC 2 compliance** - If handling customer data
- [ ] **GDPR compliance** - If handling EU personal data
- [ ] **Data residency** - Region-specific storage
- [ ] **Incident response** - Documented procedures
- [ ] **Penetration testing** - Regular security assessments

## Audit Logging

Implement audit logging by wrapping the server:

```typescript
import { createServer } from 'deepadata-edm-mcp-server';

const { server, getAuthContext } = createServer({
  auth: async (request) => {
    const context = await yourAuth(request);

    // Log access attempt
    await log({
      timestamp: new Date().toISOString(),
      userId: context?.userId || 'anonymous',
      action: 'auth',
      success: !!context,
    });

    return context;
  },
});

// Wrap resource reads
const originalRead = server.handlers.get('resources/read');
server.setRequestHandler('resources/read', async (request) => {
  const context = getAuthContext();

  await log({
    timestamp: new Date().toISOString(),
    userId: context?.userId,
    action: 'resource_read',
    uri: request.params.uri,
  });

  return originalRead(request);
});
```

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email security@deepadata.io with details
3. Include reproduction steps if possible
4. Allow reasonable time for a fix before disclosure

## Security Updates

Subscribe to security advisories:

- Watch the GitHub repository for security alerts
- Monitor npm security advisories for dependencies
- Join the deepadata security mailing list
