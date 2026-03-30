# deepadata-edm-mcp-server

MCP adapter for EDM artifacts in AI assistants.

## What This Repo Is

An MCP (Model Context Protocol) server that exposes EDM
artifacts as Resources for AI assistants like Claude Desktop.
Thin adapter architecture — brings significance artifacts
into the assistant context window.

- **Current version:** v0.1.0
- **License:** UNLICENSED (commercial)
- **Status:** Production ready — v0.1.0 published to npm 2026-03-30. Four tools: extract_from_content, seal_artifact, validate_edm, edm_project. Real extraction via DeepaData hosted API. 108 tests passing.

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
- `edm_project` — Agent projection (ADR-0006)

## Hard Constraints

| Constraint | Reason |
|---|---|
| Do not implement local signing | CA model — use /api/v1/issue |
| BYOA security model | Bring Your Own Auth |

## Source of Truth

→ **See `deepadata-com/planning/CLAUDE_PROJECT.md`**
