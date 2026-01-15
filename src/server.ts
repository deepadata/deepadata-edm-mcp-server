#!/usr/bin/env node
/**
 * deepadata-edm-mcp-server
 *
 * MCP server exposing EDM artifacts as resources for AI assistants.
 * This is a thin adapter for Claude Desktop and MCP-compatible agents.
 *
 * SECURITY WARNING: Requires secure deployment with BYOA (Bring Your Own Auth).
 * NOT safe for public internet deployment without proper security.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import type {
  ServerConfig,
  AuthContext,
  AuthMiddleware,
  ArtifactStorage,
  EnvelopeStorage,
} from './types.js';

import {
  createNoAuthMiddleware,
  createEnvTokenMiddleware,
} from './security/middleware.js';

import {
  createFileSystemStorage,
  createMemoryStorage,
} from './storage/index.js';

import {
  EdmResourceProvider,
  DdnaResourceProvider,
  getEdmResourceTemplates,
  getDdnaResourceTemplates,
  EdmResourceError,
  EdmResourceErrorCode,
  DdnaResourceError,
  DdnaResourceErrorCode,
} from './resources/index.js';

import {
  createExtractTool,
  createSealTool,
  createValidateTool,
  extractToolDefinition,
  sealToolDefinition,
  validateToolDefinition,
} from './tools/index.js';

/**
 * Server name and version
 */
const SERVER_NAME = 'deepadata-edm-mcp-server';
const SERVER_VERSION = '0.1.0';

/**
 * Create and configure the MCP server
 */
export function createServer(config: ServerConfig = {}) {
  // Initialize auth middleware
  const auth: AuthMiddleware =
    config.auth ||
    (process.env.EDM_AUTH_TOKEN
      ? createEnvTokenMiddleware()
      : createNoAuthMiddleware());

  // Track current auth context (updated per request in production)
  let currentAuthContext: AuthContext | null = null;
  const getAuthContext = () => currentAuthContext;

  // Initialize storage
  let artifactStorage: ArtifactStorage;
  let envelopeStorage: EnvelopeStorage;

  const storagePath =
    config.storage?.path ||
    process.env.EDM_STORAGE_PATH ||
    process.cwd() + '/.edm-data';

  if (config.storage?.type === 'filesystem' || process.env.EDM_STORAGE_PATH) {
    const fsStorage = createFileSystemStorage(storagePath);
    artifactStorage = fsStorage.createArtifactStorage();
    envelopeStorage = fsStorage.createEnvelopeStorage();
  } else {
    // Default to memory storage for development
    const memStorage = createMemoryStorage();
    artifactStorage = memStorage.createArtifactStorage();
    envelopeStorage = memStorage.createEnvelopeStorage();

    console.error(
      'Warning: Using in-memory storage. Set EDM_STORAGE_PATH for persistence.'
    );
  }

  // Create resource providers
  const edmProvider = new EdmResourceProvider(artifactStorage, getAuthContext);
  const ddnaProvider = new DdnaResourceProvider(envelopeStorage, getAuthContext);

  // Create tools
  const extractTool = createExtractTool(artifactStorage, getAuthContext);
  const sealTool = createSealTool(envelopeStorage, getAuthContext);
  const validateTool = createValidateTool();

  // Create MCP server
  const server = new Server(
    {
      name: config.name || SERVER_NAME,
      version: config.version || SERVER_VERSION,
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // Handler: List resource templates
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    return {
      resourceTemplates: [
        ...getEdmResourceTemplates(),
        ...getDdnaResourceTemplates(),
      ],
    };
  });

  // Handler: List resources
  server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    // Update auth context from request
    currentAuthContext = await auth(request);

    try {
      const edmResources = await edmProvider.list();
      const ddnaResources = await ddnaProvider.list();

      return {
        resources: [
          ...edmResources.map((r) => ({
            uri: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType,
          })),
          ...ddnaResources.map((r) => ({
            uri: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType,
          })),
        ],
      };
    } catch (error) {
      console.error('Error listing resources:', error);
      return { resources: [] };
    }
  });

  // Handler: Read resource
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    // Update auth context from request
    currentAuthContext = await auth(request);

    const uri = request.params.uri;

    try {
      // Try EDM provider
      if (EdmResourceProvider.matches(uri)) {
        const result = await edmProvider.read(uri);
        return {
          contents: [
            {
              uri: result.uri,
              mimeType: result.mimeType,
              text: result.text,
            },
          ],
        };
      }

      // Try DDNA provider
      if (DdnaResourceProvider.matches(uri)) {
        const result = await ddnaProvider.read(uri);
        return {
          contents: [
            {
              uri: result.uri,
              mimeType: result.mimeType,
              text: result.text,
            },
          ],
        };
      }

      throw new McpError(ErrorCode.InvalidRequest, `Unknown resource URI: ${uri}`);
    } catch (error) {
      if (error instanceof EdmResourceError) {
        switch (error.code) {
          case EdmResourceErrorCode.NOT_FOUND:
            throw new McpError(ErrorCode.InvalidRequest, error.message);
          case EdmResourceErrorCode.ACCESS_DENIED:
            throw new McpError(ErrorCode.InvalidRequest, error.message);
          default:
            throw new McpError(ErrorCode.InternalError, error.message);
        }
      }

      if (error instanceof DdnaResourceError) {
        switch (error.code) {
          case DdnaResourceErrorCode.NOT_FOUND:
            throw new McpError(ErrorCode.InvalidRequest, error.message);
          case DdnaResourceErrorCode.ACCESS_DENIED:
            throw new McpError(ErrorCode.InvalidRequest, error.message);
          case DdnaResourceErrorCode.INVALID_SIGNATURE:
            throw new McpError(ErrorCode.InvalidRequest, error.message);
          default:
            throw new McpError(ErrorCode.InternalError, error.message);
        }
      }

      if (error instanceof McpError) {
        throw error;
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to read resource: ${(error as Error).message}`
      );
    }
  });

  // Handler: List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [extractToolDefinition, sealToolDefinition, validateToolDefinition],
    };
  });

  // Handler: Call tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Update auth context from request
    currentAuthContext = await auth(request);

    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'extract_from_content': {
          const result = await extractTool.handler(args);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'seal_artifact': {
          const result = await sealTool.handler(args);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'validate_edm': {
          const result = await validateTool.handler(args);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Tool execution failed: ${(error as Error).message}`
      );
    }
  });

  return {
    server,
    artifactStorage,
    envelopeStorage,
    getAuthContext,
    setAuthContext: (ctx: AuthContext | null) => {
      currentAuthContext = ctx;
    },
  };
}

/**
 * Run server with stdio transport
 */
export async function runServer(config?: ServerConfig) {
  const { server } = createServer(config);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
}

/**
 * Main entry point
 */
async function main() {
  try {
    await runServer();
  } catch (error) {
    console.error('Server error:', error);
    process.exit(1);
  }
}

// Run if executed directly
main();

// Export for programmatic use
export * from './types.js';
export * from './security/index.js';
export * from './storage/index.js';
export * from './resources/index.js';
export * from './tools/index.js';
