# deepadata-edm-mcp-server

[![npm version](https://badge.fury.io/js/deepadata-edm-mcp-server.svg)](https://www.npmjs.com/package/deepadata-edm-mcp-server)
[![License: UNLICENSED](https://img.shields.io/badge/license-UNLICENSED-red.svg)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-blue.svg)](https://modelcontextprotocol.io)

**The significance layer for AI memory — as an MCP server.**

Eight tools for extracting, governing, and querying
emotionally significant moments from text. Built on
the Emotional Data Model (EDM) open standard.

## Quick Install

```bash
npx deepadata-edm-mcp-server
```

Add to Claude Desktop config:
```json
{
  "mcpServers": {
    "deepadata": {
      "command": "npx",
      "args": ["-y", "deepadata-edm-mcp-server"],
      "env": {
        "DEEPADATA_API_KEY": "dda_live_...",
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

## What It Does

EDM extracts what mattered from text —
not just what happened. Given a journal
entry, therapy session, or conversation,
it returns structured significance fields:
arc_type, emotional_weight, identity_thread,
anchor, wound, bridge, narrative.

These fields power significance-weighted
retrieval — finding memories by what mattered,
not keyword frequency.

## The Eight Tools

### Extraction & Governance
| Tool | Description |
|---|---|
| extract_from_content | Extract EDM artifact from text via /v1/extract |
| seal_artifact | Cryptographically seal artifact via /api/v1/issue |
| validate_edm | Validate artifact against EDM v0.7.0 schema |
| edm_project | Project artifact fields for agent context |

### Significance Routing
| Tool | Description |
|---|---|
| deepadata_activate | Translate NL query to EDM field filters via /v1/activate |

### Significance Wiki (new in v0.2.0)
| Tool | Description |
|---|---|
| edm_wiki_generate | Generate two-file wiki from source text |
| edm_wiki_search | Search local wiki by arc_type, emotional_weight, identity_thread |
| edm_wiki_lint | Health check — arc distribution, recurring threads, temporal span |

## Significance Wiki

The wiki tools implement the
[EDM Significance Wiki Format](https://github.com/emotional-data-model/edm-spec/blob/main/docs/WIKI_FORMAT.md)
— a two-file pattern for building personal
knowledge bases weighted by what mattered.

Given source text, `edm_wiki_generate` produces:

**wiki_article.md** — factual: what happened,
who was involved, when and where.

**significance_article.md** — structural:
why it mattered, encoded as EDM fields.

### Example significance_article.md output

```markdown
# Significance — journal-entry — 2026-04-08

## Arc Classification
- **arc_type:** threshold
- **emotional_weight:** 0.80
- **valence:** negative
- **recurrence_pattern:** chronic

## Core Significance
- **anchor:** breakup aftermath
- **wound:** inability to be present
- **fuel:** river solace
- **bridge:** walking home the long way
- **identity_thread:** emotional avoidance

## Narrative
After months of absence, she stood in
the coffee shop line looking lighter.
The last kitchen conversation replayed —
her voice steady, saying she needed
presence I couldn't give.
```

None of those fields appeared in the
source text. The structure finds them
in the meaning.

### Pair with qmd for significance search

```
edm_wiki_generate produces significance articles
qmd indexes them
Your agent queries by what mattered
```

```bash
# Generate wiki from diary directory
npx deepadata-edm-mcp-server wiki generate ./diary/

# Search by arc type
npx deepadata-edm-mcp-server wiki search --arc-type grief

# Health check your wiki
npx deepadata-edm-mcp-server wiki lint
```

## Significance Routing

`deepadata_activate` translates natural language
queries into EDM significance field filters:

```
"when was I most afraid of losing her"
        ↓
{ arc_type: "grief",
  emotional_weight: ≥0.7,
  tether_type: "person" }
```

On significance-typed queries, EDM field
routing hits 83.3% recall vs 33.3% for
raw vector similarity. The +50pp gap is
on queries where "what mattered" is the
only path to the right answer.

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| DEEPADATA_API_KEY | Yes | DeepaData API access |
| ANTHROPIC_API_KEY | Yes (wiki tools) | Wiki article generation |
| DEEPADATA_API_URL | No | Override API URL |
| KIMI_API_KEY | No | Project tool context |

Get your API key at [deepadata.com](https://deepadata.com)

## What's New in v0.2.0

- `edm_wiki_generate` — source → significance wiki
- `edm_wiki_search` — query local wiki by EDM fields
- `edm_wiki_lint` — trajectory pattern detection
- `deepadata_activate` — significance routing
- BYOK: bring your own Anthropic API key

## Open Standard

The EDM schema and wiki format are open:
- [edm-spec](https://github.com/emotional-data-model/edm-spec) — MIT
- [WIKI_FORMAT.md](https://github.com/emotional-data-model/edm-spec/blob/main/docs/WIKI_FORMAT.md) — two-file format spec

The implementation (extraction intelligence,
arc signatures, activation routing) is commercial.

## Related

- [deepadata.com](https://deepadata.com) — Platform
- [EDM Spec](https://github.com/emotional-data-model/edm-spec) — Open standard
- [EDM Whitepaper](https://zenodo.org/records/19211903) — Academic publication
