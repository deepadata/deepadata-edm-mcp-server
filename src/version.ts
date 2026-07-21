/**
 * One version universe (TODO-PROGRAM 3.e).
 *
 * Single source of truth for every version this server mentions at runtime.
 * Two distinct constants — never confused:
 *
 * - SERVER_VERSION: this MCP server's OWN version, derived from this repo's
 *   package.json. This is what the server reports as its identity to MCP
 *   clients (server info).
 * - EDM_VERSION: the EDM schema version, derived from the installed
 *   `edm-spec` package (ADR-0030/ADR-0032: the published spec is canonical;
 *   this repo consumes it like any other user of the open code). This is
 *   what tool descriptions and artifact stamps mean when they say "EDM vX".
 *
 * No literal version strings belong anywhere else in runtime code.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const SEMVER = /^\d+\.\d+\.\d+$/;

// --- Server identity (this repo's own package.json) -----------------------

const ownPkg = require('../package.json') as {
  name?: string;
  version?: string;
};

if (!SEMVER.test(ownPkg.version ?? '')) {
  throw new Error(
    `deepadata-edm-mcp-server package version missing or malformed: ${JSON.stringify(ownPkg.version)}`
  );
}

/** The MCP server's package name, e.g. "deepadata-edm-mcp-server". */
export const SERVER_NAME: string = ownPkg.name ?? 'deepadata-edm-mcp-server';

/** The MCP server's own version, e.g. "0.3.0". Reported in MCP server info. */
export const SERVER_VERSION: string = ownPkg.version as string;

// --- EDM schema version (installed edm-spec package) ----------------------

const specPkg = require('edm-spec/package.json') as { version?: string };

if (!SEMVER.test(specPkg.version ?? '')) {
  throw new Error(
    `edm-spec package version missing or malformed: ${JSON.stringify(specPkg.version)}`
  );
}

/** The EDM schema version, e.g. "0.8.3". */
export const EDM_VERSION: string = specPkg.version as string;

const [edmMajor, edmMinor] = EDM_VERSION.split('.');

/** The EDM version line, e.g. "0.8". */
export const EDM_VERSION_LINE = `${edmMajor}.${edmMinor}`;

/**
 * The version segment used in schema $id URLs and /schemas/edm/ paths.
 * The edm-spec convention pins these at the patch-zero of the line
 * (e.g. "v0.8.0" while the spec is at 0.8.3).
 */
export const EDM_SCHEMA_URL_VERSION = `v${EDM_VERSION_LINE}.0`;

/** Human label for the EDM version, e.g. "v0.8.3". */
export const EDM_VERSION_LABEL = `v${EDM_VERSION}`;
