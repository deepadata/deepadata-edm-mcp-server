# deepadata-edm-mcp-server

MCP adapter for EDM artifacts in AI assistants.

## What This Repo Is

An MCP (Model Context Protocol) server that exposes EDM
artifacts as Resources for AI assistants like Claude Desktop.
Thin adapter architecture — brings significance artifacts
into the assistant context window.

- **Current version:** v0.3.0
- **License:** UNLICENSED (commercial)
- **Status:** Production ready — v0.3.0 EDM v0.8.0 support. Eight tools including wiki generation. Real extraction via DeepaData hosted API.
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
- `edm_project` — Agent projection (ADR-0006)
- `deepadata_activate` — NL query to significance field filters
- `edm_wiki_generate` — Generate significance wiki from source text
- `edm_wiki_search` — Search wiki by arc_type, emotional_weight, identity_thread
- `edm_wiki_lint` — Health check and trajectory pattern detection

## Hard Constraints

| Constraint | Reason |
|---|---|
| Do not implement local signing | CA model — use /api/v1/issue |
| BYOA security model | Bring Your Own Auth |

## Source of Truth

→ **See `deepadata-com/planning/CLAUDE_PROJECT.md`**
