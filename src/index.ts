/**
 * deepadata-edm-mcp-server
 *
 * MCP server exposing EDM artifacts as resources for AI assistants.
 */

export { createServer, runServer } from './server.js';

// Re-export version truth (SERVER_VERSION = this server; EDM_VERSION = spec)
export * from './version.js';

// Re-export types
export * from './types.js';

// Re-export API client
export * from './api/index.js';

// Re-export security
export * from './security/index.js';

// Re-export storage
export * from './storage/index.js';

// Re-export resources
export * from './resources/index.js';

// Re-export tools
export * from './tools/index.js';
