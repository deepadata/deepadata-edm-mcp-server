# deepadata-edm-mcp-server

MCP adapter for EDM artifacts in AI assistants.

**Last session:** 2026-07-22 — version truth (one version universe, TODO 3.e): `edm-spec` dependency added, `src/version.ts` (SERVER_VERSION + EDM_VERSION), `deepadata_activate_reason` tool added. Local only, NOT published.

## What This Repo Is

An MCP (Model Context Protocol) server that exposes EDM
artifacts as Resources for AI assistants like Claude Desktop.
Thin adapter architecture — brings significance artifacts
into the assistant context window.

- **Current version:** v0.3.0
- **License:** UNLICENSED (commercial)
- **Status:** Production ready — nine tools including wiki generation and significance reasoning. Real extraction via DeepaData hosted API. EDM version derives from the installed `edm-spec` package (see Version Truth below).
- **v0.3.0:** EDM v0.8.0 support — +gratitude +authenticity arc_types, partner: prefix meta.profile per ADR-0017.
- **v0.2.0:** Added `edm_wiki_generate`, `edm_wiki_search`, `edm_wiki_lint` tools. Significance wiki as navigable markdown, BYOK, Obsidian-ready output.

## Role in the DeepaData System

```
   deepadata-com (platform, sealing)
       ↓ produces certified artifacts
→ deepadata-edm-mcp-server ← YOU ARE HERE
       ↓ exposes as MCP Resources
   Claude Desktop / AI assistants
```

## MCP Resources

- `edm://artifact/{id}` — Raw EDM artifacts (.edm.json)
- `ddna://envelope/{id}` — Sealed envelopes (.ddna)

## MCP Tools

- `extract_from_content` — LLM extraction via DeepaData API
- `seal_artifact` — Certified sealing via DeepaData API
- `validate_edm` — Schema validation
- `edm_project` — Agent projection (ADR-0009)
- `deepadata_activate` — NL query to significance field filters
- `deepadata_activate_reason` — significance reasoning: answer + sources + fields_used (ADR-0018)
- `edm_wiki_generate` — Generate significance wiki from source text
- `edm_wiki_search` — Search wiki by arc_type, emotional_weight, identity_thread
- `edm_wiki_lint` — Health check and trajectory pattern detection

## Hard Constraints

| Constraint | Reason |
|---|---|
| Do not implement local signing | CA model — use /api/v1/issue |
| BYOA security model | Bring Your Own Auth |

## Version Truth (one version universe, TODO 3.e)

`src/version.ts` is the single source of every version this server
mentions at runtime:

- `SERVER_VERSION` — this server's OWN version, derived from this
  repo's `package.json`. Reported as MCP server info.
- `EDM_VERSION` (+ `EDM_VERSION_LABEL`, `EDM_VERSION_LINE`,
  `EDM_SCHEMA_URL_VERSION` patch-zero URL segment) — the EDM schema
  version, derived from the installed `edm-spec` package (ADR-0030:
  the published spec is canonical).

Two constants, each derived, never confused. No literal version
strings belong anywhere else in runtime code.

## Open Items

- `activate_reason` MCP tool: DONE 2026-07-22 —
  `deepadata_activate_reason` wraps `/api/v1/activate_reason`
  (ADR-0018).

## Pending

- **TODO-to-flip-at-publish:** the `edm-spec` dependency is pinned to
  `file:../edm-spec` (local clone, branch release/v0.8.3). Flip to the
  versioned npm dependency (e.g. `"edm-spec": "^0.8.3"`) once 0.8.3 is
  published to npm — before any npm publish of this package.

## Source of Truth

→ **See `deepadata-com/planning/CLAUDE_PROJECT.md`**
