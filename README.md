# deepadata-edm-mcp-server

The significance layer for AI memory — as an MCP server.

EDM artifacts encode what mattered at capture time: emotional weight, arc type, recall triggers, identity thread. This MCP server exposes EDM extraction and sealing as tools for Claude Desktop and any MCP-compatible AI agent.

Four tools:
- **extract_from_content** — extract EDM artifact from any text
- **seal_artifact** — seal and register artifact via DeepaData API
- **validate_edm** — validate artifact against EDM v0.7.0 schema
- **edm_project** — project artifact fields as agent context

Requires a `DEEPADATA_API_KEY`. Get one at [deepadata.com](https://deepadata.com).

## Overview

This server implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) to expose EDM (Emotional Data Model) artifacts as resources that AI assistants can read and manipulate. It provides:

- **Resources:** Read-only access to EDM artifacts (`edm://artifact/{id}`) and sealed DDNA envelopes (`ddna://envelope/{id}`)
- **Tools:** Actions for extracting, sealing, and validating artifacts

## Installation

```bash
npm install deepadata-edm-mcp-server
```

Or clone and build from source:

```bash
git clone https://github.com/deepadata/deepadata-edm-mcp-server.git
cd deepadata-edm-mcp-server
npm install
npm run build
```

## Quick Start

### Claude Desktop Configuration

Add to your Claude Desktop configuration (`~/.claude/config.json` on macOS/Linux or `%APPDATA%\Claude\config.json` on Windows):

```json
{
  "mcpServers": {
    "deepadata": {
      "command": "npx",
      "args": ["-y", "deepadata-edm-mcp-server"],
      "env": {
        "DEEPADATA_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DEEPADATA_API_KEY` | DeepaData API key for extraction and sealing (required for production) | - |
| `DEEPADATA_API_URL` | DeepaData API base URL | `https://deepadata.com` |
| `EDM_STORAGE_PATH` | Directory for artifact/envelope storage | `./.edm-data` |
| `EDM_AUTH_TOKEN` | Authentication token (if using env token auth) | - |
| `EDM_USER_ID` | User ID for authenticated requests | `authenticated-user` |
| `EDM_USER_ROLES` | Comma-separated roles | `user` |
| `EDM_ORG_ID` | Organization ID | - |

## Resources

### EDM Artifact Resource

**URI Pattern:** `edm://artifact/{id}`

**MIME Type:** `application/json`

Read an EDM v0.7.0 artifact by ID. Respects governance rules (exportability, visibility).

### DDNA Envelope Resource

**URI Pattern:** `ddna://envelope/{id}`

**MIME Type:** `application/vnd.deepadata.ddna+json`

Read a sealed DDNA envelope. Verifies signature before returning.

## Tools

### extract_from_content

Extract EDM artifact from text content and optional image.

```typescript
{
  text: string;        // Required: Text content to extract from
  image?: string;      // Optional: Base64-encoded image
  metadata?: object;   // Optional: Additional metadata
  contentType?: string; // Optional: Content type hint
  save?: boolean;      // Optional: Save to storage (default: false)
}
```

### seal_artifact

Seal an EDM artifact via DeepaData API, creating a certified `.ddna` envelope with registry entry.

**Note:** Requires `DEEPADATA_API_KEY` environment variable.

```typescript
{
  artifact: object;    // Required: EDM artifact to seal
  pathway?: string;    // Optional: "subject" | "delegated" | "retrospective" (default: "delegated")
  authority?: string;  // Optional: Authority identifier (default: "mcp:edm-server")
  save?: boolean;      // Optional: Save to local storage (default: false)
}
```

### validate_edm

Validate an EDM artifact against the schema.

```typescript
{
  artifact: object;    // Required: EDM artifact to validate
  strict?: boolean;    // Optional: Treat warnings as errors
}
```

### edm_project

Project an EDM artifact into the canonical agent-consumable shape (ADR-0006). Preserves governance properties for agent pipelines.

```typescript
{
  artifact_id: string;    // Required: ID of the artifact to project
  context_note?: boolean; // Optional: Generate LLM summary if true
}
```

Returns the projection shape with `governance`, `emotional_state`, `salience`, and optional `context_note` blocks. See ADR-0006 for the full projection schema.

## Programmatic Usage

```typescript
import { createServer } from 'deepadata-edm-mcp-server';
import { createFileSystemStorage } from 'deepadata-edm-mcp-server/storage';

// Create server with custom configuration
const { server, artifactStorage, envelopeStorage } = createServer({
  storage: {
    type: 'filesystem',
    path: '/path/to/data',
  },
  auth: async (request) => {
    // Your authentication logic here
    return {
      userId: 'user-123',
      roles: ['user'],
      organizationId: 'org-456',
    };
  },
});

// Run the server
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Security Checklist

Before deploying `deepadata-edm-mcp-server`:

- [ ] **Authentication middleware configured** - Do not use `createNoAuthMiddleware()` in production
- [ ] **Authorization checks enforce governance fields** - Verify exportability and visibility rules
- [ ] **Storage backend uses encryption at rest** - Enable encryption for file/cloud storage
- [ ] **Network access restricted** - Deploy behind VPN, firewall, or private network
- [ ] **Audit logging enabled** - Log all access and modifications
- [ ] **Regular security reviews scheduled** - Review access logs and configurations
- [ ] **Incident response plan documented** - Know how to respond to security events

**This server is NOT safe for public internet deployment without proper security.**

## Architecture

```
src/
├── server.ts              # MCP server setup and request handling
├── index.ts               # Main exports
├── types.ts               # TypeScript type definitions
├── resources/
│   ├── edm.ts             # EDM artifact resource provider
│   ├── ddna.ts            # DDNA envelope resource provider
│   └── index.ts
├── tools/
│   ├── extract.ts         # extract_from_content tool
│   ├── seal.ts            # seal_artifact tool
│   ├── validate.ts        # validate_edm tool
│   └── index.ts
├── storage/
│   ├── base.ts            # Storage interface and base classes
│   ├── filesystem.ts      # File system storage implementation
│   ├── memory.ts          # In-memory storage (for testing)
│   └── index.ts
└── security/
    ├── governance.ts      # Exportability, visibility enforcement
    ├── middleware.ts      # Auth middleware interfaces
    └── index.ts
```

## Storage Backends

### File System (Default for Production)

```typescript
import { createFileSystemStorage } from 'deepadata-edm-mcp-server/storage';

const storage = createFileSystemStorage('/path/to/data');
const artifactStorage = storage.createArtifactStorage();
const envelopeStorage = storage.createEnvelopeStorage();
```

### In-Memory (Development/Testing)

```typescript
import { createMemoryStorage } from 'deepadata-edm-mcp-server/storage';

const storage = createMemoryStorage();
const artifactStorage = storage.createArtifactStorage();
// storage.clearAll() to reset
```

### Custom Storage

Implement the `ArtifactStorage` and `EnvelopeStorage` interfaces for custom backends (S3, databases, etc.).

## Auth Middleware

### No Auth (Development Only)

```typescript
import { createNoAuthMiddleware } from 'deepadata-edm-mcp-server/security';

const auth = createNoAuthMiddleware('dev-user');
```

### Environment Token

```typescript
import { createEnvTokenMiddleware } from 'deepadata-edm-mcp-server/security';

// Reads EDM_AUTH_TOKEN from environment
const auth = createEnvTokenMiddleware();
```

### Custom Auth

```typescript
import type { AuthMiddleware } from 'deepadata-edm-mcp-server';

const auth: AuthMiddleware = async (request) => {
  // Your authentication logic
  const token = extractToken(request);
  const user = await validateToken(token);

  if (!user) return null;

  return {
    userId: user.id,
    roles: user.roles,
    organizationId: user.orgId,
  };
};
```

## Governance

The server enforces EDM governance fields:

- **Exportability:** `allowed`, `restricted`, `prohibited`
- **Visibility:** `public`, `private`, `shared`
- **Retention:** Expiration policies

Artifacts with `exportability: prohibited` cannot be read via resources. Private artifacts require owner authentication.

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Run tests
npm test

# Type check
npm run typecheck
```

## License

This software is proprietary. See [PROPRIETARY.md](PROPRIETARY.md) for license terms.

To use this server, obtain a `DEEPADATA_API_KEY` at [deepadata.com](https://deepadata.com).

## Related Projects

- [deepadata-edm-sdk](https://github.com/deepadata/deepadata-edm-sdk) - EDM SDK for extraction
- [deepadata-ddna-tools](https://github.com/emotional-data-model/ddna-tools) - DDNA sealing and verification
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP specification
