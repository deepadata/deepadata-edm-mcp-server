---
name: deepadata_wiki
description: Generate a significance wiki from text files. Extracts what mattered — arc_type, emotional_weight, identity_thread — from any journal, diary, or conversation text.
argument-hint: <source-path> [output-dir]
tools: [Bash, Read, Write]
---

# Generate Significance Wiki

Generate a two-file significance wiki from text files using DeepaData EDM extraction.

## What this produces

For each source file:
- **wiki_article.md** — factual summary (what happened, who, when, where)
- **significance_article.md** — why it mattered (arc_type, emotional_weight, identity_thread, anchor, wound, bridge)

## Steps

1. Check prerequisites:
   - Verify DEEPADATA_API_KEY is set:
     `echo $DEEPADATA_API_KEY`
   - If not set, tell user:
     "Set DEEPADATA_API_KEY=dda_live_... Get your key at deepadata.com"
   - Verify ANTHROPIC_API_KEY is set
   - If not set, tell user:
     "Set ANTHROPIC_API_KEY=sk-ant-..."

2. Set source and output paths:
   - source_path = $0 (required)
   - output_dir = $1 or "./wiki" if not set

3. Check source path exists and has .txt or .md files:
   ```bash
   ls $source_path/*.txt $source_path/*.md 2>/dev/null | head -5
   ```
   If no files found, report and stop.

4. Run wiki generation:
   ```bash
   npx -y deepadata-edm-mcp-server \
     wiki generate "$source_path" \
     --output "$output_dir"
   ```

5. Report results:
   - List generated files
   - Show the significance_article.md content for the first file
   - Tell user: "Open $output_dir in Obsidian for graph view — identity_threads and arc_types become connected nodes"

## Open Standard

The output format follows the EDM Significance Wiki Format:
https://github.com/emotional-data-model/edm-spec/blob/main/docs/WIKI_FORMAT.md

Anyone can implement this format. DeepaData provides the extraction intelligence.
