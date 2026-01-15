/**
 * deepadata-edm-mcp-server
 *
 * MCP server exposing EDM artifacts as resources for AI assistants.
 */

export { createServer, runServer } from './server.js';

// Re-export types
export * from './types.js';

// Re-export security
export * from './security/index.js';

// Re-export storage
export * from './storage/index.js';

// Re-export resources
export * from './resources/index.js';

// Re-export tools
export * from './tools/index.js';
