/**
 * Significance Wiki Tools
 *
 * Three MCP tools for generating, searching, and linting significance wikis.
 * Per ADR-0015: wiki tools live in deepadata-edm-mcp-server, not separate repo.
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Tool Definitions
// ============================================================================

export const wikiGenerateToolDefinition = {
  name: 'edm_wiki_generate',
  description:
    'Generate significance wiki from source text. ' +
    'Extracts EDM artifact and produces wiki_article.md + significance_article.md. ' +
    'Requires DEEPADATA_API_KEY for extraction.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      source_path: {
        type: 'string',
        description: 'Path to source file or directory containing .txt/.md files',
      },
      output_dir: {
        type: 'string',
        description: 'Output directory for wiki files (default: ./wiki)',
      },
      profile: {
        type: 'string',
        enum: ['extended', 'full'],
        description: 'Extraction profile (default: extended)',
      },
    },
    required: ['source_path'],
  },
};

export const wikiSearchToolDefinition = {
  name: 'edm_wiki_search',
  description:
    'Search significance wiki by emotional criteria. ' +
    'Queries local significance_article.md files by arc_type, emotional_weight, identity_thread.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      wiki_path: {
        type: 'string',
        description: 'Path to wiki directory',
      },
      arc_type: {
        type: 'string',
        description: 'Filter by arc type (e.g., grief, transformation, bond)',
      },
      emotional_weight_min: {
        type: 'number',
        description: 'Minimum emotional weight (0.0-1.0)',
      },
      identity_thread: {
        type: 'string',
        description: 'Search identity threads (substring match)',
      },
      recurrence_pattern: {
        type: 'string',
        enum: ['acute', 'cyclical', 'chronic'],
        description: 'Filter by recurrence pattern',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default: 10)',
      },
    },
    required: ['wiki_path'],
  },
};

export const wikiLintToolDefinition = {
  name: 'edm_wiki_lint',
  description:
    'Health check and trajectory pattern detection for significance wiki. ' +
    'Reports arc distribution, emotional weight stats, recurring themes, and missing fields.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      wiki_path: {
        type: 'string',
        description: 'Path to wiki directory',
      },
    },
    required: ['wiki_path'],
  },
};

// ============================================================================
// Types
// ============================================================================

interface WikiGenerateResult {
  files_processed: number;
  files_written: string[];
  errors: string[];
}

interface SignificanceArticle {
  file_path: string;
  date: string;
  arc_type: string | null;
  emotional_weight: number | null;
  valence: string | null;
  recurrence_pattern: string | null;
  anchor: string | null;
  wound: string | null;
  fuel: string | null;
  bridge: string | null;
  spark: string | null;
  echo: string | null;
  identity_thread: string | null;
  tether_type: string | null;
  narrative_archetype: string | null;
  emotion_primary: string | null;
  emotion_subtone: string[] | null;
  motivational_orientation: string | null;
  recall_triggers: string[] | null;
  somatic_signature: string | null;
  narrative: string | null;
  artifact_id: string | null;
  captured_at: string | null;
  profile: string | null;
  vp_id: string | null;
}

interface WikiSearchResult {
  matches: SignificanceArticle[];
  total_scanned: number;
  query: {
    arc_type?: string;
    emotional_weight_min?: number;
    identity_thread?: string;
    recurrence_pattern?: string;
  };
}

interface WikiLintResult {
  total_articles: number;
  arc_type_distribution: Record<string, number>;
  emotional_weight_stats: {
    avg: number;
    min: number;
    max: number;
    high_significance_count: number; // > 0.8
  };
  recurring_identity_threads: Array<{ thread: string; count: number }>;
  recurrence_patterns: {
    acute: number;
    cyclical: number;
    chronic: number;
  };
  missing_fields: {
    no_arc_type: number;
    no_emotional_weight: number;
    no_identity_thread: number;
  };
  temporal_span: {
    earliest: string | null;
    latest: string | null;
  };
}

// EDM artifact shape (portable domains only)
interface EdmArtifactPortable {
  meta?: {
    artifact_id?: string;
    captured_at?: string;
    profile?: string;
  };
  core?: {
    anchor?: string;
    wound?: string;
    fuel?: string;
    bridge?: string;
    spark?: string;
    echo?: string;
    narrative?: string;
  };
  constellation?: {
    arc_type?: string;
    identity_thread?: string;
    somatic_signature?: string;
    narrative_archetype?: string;
    emotion_primary?: string;
    emotion_subtone?: string[];
  };
  gravity?: {
    emotional_weight?: number;
    valence?: string;
    recurrence_pattern?: string;
    tether_type?: string;
    recall_triggers?: string[];
  };
  impulse?: {
    motivational_orientation?: string;
  };
  governance?: {
    vp_id?: string;
  };
  milky_way?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

// ============================================================================
// Wiki Generate Tool
// ============================================================================

export class WikiGenerateToolHandler {
  constructor(
    private readonly apiKey?: string,
    private readonly apiBaseUrl?: string,
    private readonly anthropicApiKey?: string
  ) {}

  async execute(args: {
    source_path: string;
    output_dir?: string;
    profile?: 'extended' | 'full';
  }): Promise<WikiGenerateResult> {
    const apiKey = this.apiKey ?? process.env.DEEPADATA_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPADATA_API_KEY is required for wiki generation');
    }

    const anthropicKey = this.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      throw new Error('ANTHROPIC_API_KEY is required for wiki article generation');
    }

    const baseUrl =
      this.apiBaseUrl ?? process.env.DEEPADATA_API_URL ?? 'https://deepadata.com';
    const outputDir = args.output_dir ?? './wiki';
    const profile = args.profile ?? 'extended';

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Collect source files
    const sourceFiles = this.collectSourceFiles(args.source_path);
    if (sourceFiles.length === 0) {
      return {
        files_processed: 0,
        files_written: [],
        errors: [`No .txt or .md files found in ${args.source_path}`],
      };
    }

    const result: WikiGenerateResult = {
      files_processed: 0,
      files_written: [],
      errors: [],
    };

    for (const sourceFile of sourceFiles) {
      try {
        const content = fs.readFileSync(sourceFile, 'utf-8');
        const filename = path.basename(sourceFile, path.extname(sourceFile));
        const date = new Date().toISOString().split('T')[0];

        // 1. Extract EDM artifact
        const artifact = await this.extractArtifact(
          baseUrl,
          apiKey,
          content,
          profile
        );

        // 2. Generate significance_article.md from artifact
        const significanceArticle = this.buildSignificanceArticle(
          filename,
          date,
          artifact
        );

        // 3. Generate wiki_article.md via Anthropic
        const wikiArticle = await this.generateWikiArticle(
          anthropicKey,
          content,
          filename,
          date
        );

        // 4. Write files
        const articleDir = path.join(outputDir, `${date}-${filename}`);
        if (!fs.existsSync(articleDir)) {
          fs.mkdirSync(articleDir, { recursive: true });
        }

        const sigPath = path.join(articleDir, 'significance_article.md');
        const wikiPath = path.join(articleDir, 'wiki_article.md');

        fs.writeFileSync(sigPath, significanceArticle, 'utf-8');
        fs.writeFileSync(wikiPath, wikiArticle, 'utf-8');

        result.files_processed++;
        result.files_written.push(sigPath, wikiPath);
      } catch (error) {
        result.errors.push(
          `${sourceFile}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return result;
  }

  private collectSourceFiles(sourcePath: string): string[] {
    const stats = fs.statSync(sourcePath);
    if (stats.isFile()) {
      const ext = path.extname(sourcePath).toLowerCase();
      if (ext === '.txt' || ext === '.md') {
        return [sourcePath];
      }
      return [];
    }

    if (stats.isDirectory()) {
      const files: string[] = [];
      const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(sourcePath, entry.name);
        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (ext === '.txt' || ext === '.md') {
            files.push(fullPath);
          }
        } else if (entry.isDirectory()) {
          files.push(...this.collectSourceFiles(fullPath));
        }
      }
      return files;
    }

    return [];
  }

  private async extractArtifact(
    baseUrl: string,
    apiKey: string,
    content: string,
    profile: string
  ): Promise<EdmArtifactPortable> {
    const response = await fetch(`${baseUrl}/api/v1/extract`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        profile,
        source: 'mcp',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Extraction failed: ${response.status} ${JSON.stringify(error)}`
      );
    }

    const result = (await response.json()) as {
      success: boolean;
      data?: EdmArtifactPortable;
      error?: { message: string };
    };

    if (!result.success || !result.data) {
      throw new Error(
        `Extraction failed: ${result.error?.message ?? 'Unknown error'}`
      );
    }

    return result.data;
  }

  private buildSignificanceArticle(
    filename: string,
    date: string,
    artifact: EdmArtifactPortable
  ): string {
    const lines: string[] = [];

    lines.push(`# Significance — ${filename} — ${date}`);
    lines.push('');

    // Arc Classification
    const arcType = artifact.constellation?.arc_type;

    if (arcType) {
      lines.push('## Arc Classification');
      lines.push(`- **arc_type:** ${arcType}`);
      lines.push('');
    }

    // Emotional Weight
    const emotionalWeight = artifact.gravity?.emotional_weight;
    const valence = artifact.gravity?.valence;
    const recurrencePattern = artifact.gravity?.recurrence_pattern;

    if (emotionalWeight != null || valence || recurrencePattern) {
      lines.push('## Emotional Weight');
      if (emotionalWeight != null)
        lines.push(`- **emotional_weight:** ${emotionalWeight.toFixed(2)}`);
      if (valence) lines.push(`- **valence:** ${valence}`);
      if (recurrencePattern)
        lines.push(`- **recurrence_pattern:** ${recurrencePattern}`);
      lines.push('');
    }

    // Core Significance
    const anchor = artifact.core?.anchor;
    const wound = artifact.core?.wound;
    const fuel = artifact.core?.fuel;
    const bridge = artifact.core?.bridge;
    const spark = artifact.core?.spark;
    const echo = artifact.core?.echo;

    if (anchor || wound || fuel || bridge || spark || echo) {
      lines.push('## Core Significance');
      if (anchor) lines.push(`- **anchor:** ${anchor}`);
      if (wound) lines.push(`- **wound:** ${wound}`);
      if (fuel) lines.push(`- **fuel:** ${fuel}`);
      if (bridge) lines.push(`- **bridge:** ${bridge}`);
      if (spark) lines.push(`- **spark:** ${spark}`);
      if (echo) lines.push(`- **echo:** ${echo}`);
      lines.push('');
    }

    // Identity
    const identityThread = artifact.constellation?.identity_thread;
    const tetherType = artifact.gravity?.tether_type;
    const narrativeArchetype = artifact.constellation?.narrative_archetype;
    const emotionPrimary = artifact.constellation?.emotion_primary;
    const emotionSubtone = artifact.constellation?.emotion_subtone;
    const motivationalOrientation = artifact.impulse?.motivational_orientation;

    if (identityThread || tetherType || narrativeArchetype || emotionPrimary || emotionSubtone || motivationalOrientation) {
      lines.push('## Identity');
      if (identityThread) lines.push(`- **identity_thread:** ${identityThread}`);
      if (tetherType) lines.push(`- **tether_type:** ${tetherType}`);
      if (narrativeArchetype) lines.push(`- **narrative_archetype:** ${narrativeArchetype}`);
      if (emotionPrimary) lines.push(`- **emotion_primary:** ${emotionPrimary}`);
      if (emotionSubtone && emotionSubtone.length > 0) lines.push(`- **emotion_subtone:** ${JSON.stringify(emotionSubtone)}`);
      if (motivationalOrientation) lines.push(`- **motivational_orientation:** ${motivationalOrientation}`);
      lines.push('');
    }

    // Recall
    const recallTriggers = artifact.gravity?.recall_triggers;
    const somaticSignature = artifact.constellation?.somatic_signature;

    if (
      (recallTriggers && recallTriggers.length > 0) ||
      somaticSignature
    ) {
      lines.push('## Recall');
      if (recallTriggers && recallTriggers.length > 0) {
        lines.push(
          `- **recall_triggers:** ${JSON.stringify(recallTriggers)}`
        );
      }
      if (somaticSignature)
        lines.push(`- **somatic_signature:** ${somaticSignature}`);
      lines.push('');
    }

    // Source Artifact
    const artifactId = artifact.meta?.artifact_id;
    const capturedAt = artifact.meta?.captured_at;
    const artifactProfile = artifact.meta?.profile;
    const vpId = artifact.governance?.vp_id;

    if (artifactId || capturedAt || artifactProfile || vpId) {
      lines.push('## Source Artifact');
      if (artifactId) lines.push(`- **artifact_id:** ${artifactId}`);
      if (capturedAt) lines.push(`- **captured_at:** ${capturedAt}`);
      if (artifactProfile) lines.push(`- **profile:** ${artifactProfile}`);
      if (vpId) lines.push(`- **vp_id:** ${vpId}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  private async generateWikiArticle(
    anthropicApiKey: string,
    content: string,
    filename: string,
    date: string
  ): Promise<string> {
    const prompt = `You are compiling a wiki article from a personal document. Write a factual summary covering: what happened, who was involved, when and where it took place, and context links to related themes. Be concise.

Format as markdown with sections:
## What Happened
## Who Was Involved
## When and Where
## Context

Source text:
${content}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Wiki article generation failed: ${response.status} ${JSON.stringify(error)}`
      );
    }

    const result = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };

    const textContent = result.content.find((c) => c.type === 'text');
    const articleBody = textContent?.text ?? '';

    return `# ${filename} — ${date}\n\n${articleBody}`;
  }
}

// ============================================================================
// Wiki Search Tool
// ============================================================================

export class WikiSearchToolHandler {
  async execute(args: {
    wiki_path: string;
    arc_type?: string;
    emotional_weight_min?: number;
    identity_thread?: string;
    recurrence_pattern?: 'acute' | 'cyclical' | 'chronic';
    limit?: number;
  }): Promise<WikiSearchResult> {
    const limit = args.limit ?? 10;

    // Find all significance_article.md files
    const articles = this.findSignificanceArticles(args.wiki_path);

    // Parse and filter
    const parsed: SignificanceArticle[] = [];
    for (const filePath of articles) {
      const article = this.parseSignificanceArticle(filePath);
      if (this.matchesFilters(article, args)) {
        parsed.push(article);
      }
    }

    // Sort by emotional_weight descending (most significant first)
    parsed.sort((a, b) => (b.emotional_weight ?? 0) - (a.emotional_weight ?? 0));

    return {
      matches: parsed.slice(0, limit),
      total_scanned: articles.length,
      query: {
        arc_type: args.arc_type,
        emotional_weight_min: args.emotional_weight_min,
        identity_thread: args.identity_thread,
        recurrence_pattern: args.recurrence_pattern,
      },
    };
  }

  private findSignificanceArticles(wikiPath: string): string[] {
    const files: string[] = [];

    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.name === 'significance_article.md') {
          files.push(fullPath);
        }
      }
    };

    walk(wikiPath);
    return files;
  }

  private parseSignificanceArticle(filePath: string): SignificanceArticle {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Extract date from directory name (format: YYYY-MM-DD-filename)
    const dirName = path.basename(path.dirname(filePath));
    const dateMatch = dirName.match(/^(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : '';

    const article: SignificanceArticle = {
      file_path: filePath,
      date,
      arc_type: null,
      emotional_weight: null,
      valence: null,
      recurrence_pattern: null,
      anchor: null,
      wound: null,
      fuel: null,
      bridge: null,
      spark: null,
      echo: null,
      identity_thread: null,
      tether_type: null,
      narrative_archetype: null,
      emotion_primary: null,
      emotion_subtone: null,
      motivational_orientation: null,
      recall_triggers: null,
      somatic_signature: null,
      narrative: null,
      artifact_id: null,
      captured_at: null,
      profile: null,
      vp_id: null,
    };

    // Parse markdown fields
    for (const line of lines) {
      const fieldMatch = line.match(/^- \*\*(\w+):\*\* (.+)$/);
      if (fieldMatch) {
        const [, key, value] = fieldMatch;
        switch (key) {
          case 'arc_type':
            article.arc_type = value;
            break;
          case 'emotional_weight':
            article.emotional_weight = parseFloat(value);
            break;
          case 'valence':
            article.valence = value;
            break;
          case 'recurrence_pattern':
            article.recurrence_pattern = value;
            break;
          case 'anchor':
            article.anchor = value;
            break;
          case 'wound':
            article.wound = value;
            break;
          case 'fuel':
            article.fuel = value;
            break;
          case 'bridge':
            article.bridge = value;
            break;
          case 'spark':
            article.spark = value;
            break;
          case 'echo':
            article.echo = value;
            break;
          case 'identity_thread':
            article.identity_thread = value;
            break;
          case 'tether_type':
            article.tether_type = value;
            break;
          case 'narrative_archetype':
            article.narrative_archetype = value;
            break;
          case 'emotion_primary':
            article.emotion_primary = value;
            break;
          case 'emotion_subtone':
            try {
              article.emotion_subtone = JSON.parse(value);
            } catch {
              article.emotion_subtone = [value];
            }
            break;
          case 'motivational_orientation':
            article.motivational_orientation = value;
            break;
          case 'recall_triggers':
            try {
              article.recall_triggers = JSON.parse(value);
            } catch {
              article.recall_triggers = [value];
            }
            break;
          case 'somatic_signature':
            article.somatic_signature = value;
            break;
          case 'artifact_id':
            article.artifact_id = value;
            break;
          case 'captured_at':
            article.captured_at = value;
            break;
          case 'profile':
            article.profile = value;
            break;
          case 'vp_id':
            article.vp_id = value;
            break;
        }
      }
    }

    // Extract narrative (text after ## Narrative heading)
    const narrativeIdx = lines.findIndex((l) => l.startsWith('## Narrative'));
    if (narrativeIdx !== -1) {
      const narrativeLines: string[] = [];
      for (let i = narrativeIdx + 1; i < lines.length; i++) {
        if (lines[i].startsWith('## ')) break;
        narrativeLines.push(lines[i]);
      }
      article.narrative = narrativeLines.join('\n').trim() || null;
    }

    return article;
  }

  private matchesFilters(
    article: SignificanceArticle,
    args: {
      arc_type?: string;
      emotional_weight_min?: number;
      identity_thread?: string;
      recurrence_pattern?: string;
    }
  ): boolean {
    if (args.arc_type && article.arc_type !== args.arc_type) {
      return false;
    }
    if (
      args.emotional_weight_min != null &&
      (article.emotional_weight == null ||
        article.emotional_weight < args.emotional_weight_min)
    ) {
      return false;
    }
    if (
      args.identity_thread &&
      (!article.identity_thread ||
        !article.identity_thread
          .toLowerCase()
          .includes(args.identity_thread.toLowerCase()))
    ) {
      return false;
    }
    if (
      args.recurrence_pattern &&
      article.recurrence_pattern !== args.recurrence_pattern
    ) {
      return false;
    }
    return true;
  }
}

// ============================================================================
// Wiki Lint Tool
// ============================================================================

export class WikiLintToolHandler {
  async execute(args: { wiki_path: string }): Promise<WikiLintResult> {
    const searchHandler = new WikiSearchToolHandler();

    // Get all articles (no filters, high limit)
    const allArticles = await searchHandler.execute({
      wiki_path: args.wiki_path,
      limit: 10000,
    });

    const articles = allArticles.matches;

    // Arc type distribution
    const arcTypeDist: Record<string, number> = {};
    for (const a of articles) {
      const arcType = a.arc_type ?? 'unknown';
      arcTypeDist[arcType] = (arcTypeDist[arcType] ?? 0) + 1;
    }

    // Emotional weight stats
    const weights = articles
      .map((a) => a.emotional_weight)
      .filter((w): w is number => w != null);

    const weightStats = {
      avg: weights.length > 0 ? weights.reduce((a, b) => a + b, 0) / weights.length : 0,
      min: weights.length > 0 ? Math.min(...weights) : 0,
      max: weights.length > 0 ? Math.max(...weights) : 0,
      high_significance_count: weights.filter((w) => w > 0.8).length,
    };

    // Identity thread counts
    const threadCounts: Record<string, number> = {};
    for (const a of articles) {
      if (a.identity_thread) {
        threadCounts[a.identity_thread] =
          (threadCounts[a.identity_thread] ?? 0) + 1;
      }
    }
    const recurringThreads = Object.entries(threadCounts)
      .filter(([, count]) => count >= 3)
      .map(([thread, count]) => ({ thread, count }))
      .sort((a, b) => b.count - a.count);

    // Recurrence patterns
    const recurrencePatterns = {
      acute: 0,
      cyclical: 0,
      chronic: 0,
    };
    for (const a of articles) {
      if (a.recurrence_pattern === 'acute') recurrencePatterns.acute++;
      else if (a.recurrence_pattern === 'cyclical') recurrencePatterns.cyclical++;
      else if (a.recurrence_pattern === 'chronic') recurrencePatterns.chronic++;
    }

    // Missing fields
    const missingFields = {
      no_arc_type: articles.filter((a) => !a.arc_type).length,
      no_emotional_weight: articles.filter((a) => a.emotional_weight == null).length,
      no_identity_thread: articles.filter((a) => !a.identity_thread).length,
    };

    // Temporal span
    const dates = articles
      .map((a) => a.date)
      .filter((d) => d && d.length > 0)
      .sort();

    return {
      total_articles: articles.length,
      arc_type_distribution: arcTypeDist,
      emotional_weight_stats: weightStats,
      recurring_identity_threads: recurringThreads,
      recurrence_patterns: recurrencePatterns,
      missing_fields: missingFields,
      temporal_span: {
        earliest: dates[0] ?? null,
        latest: dates[dates.length - 1] ?? null,
      },
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createWikiGenerateTool(
  apiKey?: string,
  apiBaseUrl?: string,
  anthropicApiKey?: string
) {
  const handler = new WikiGenerateToolHandler(apiKey, apiBaseUrl, anthropicApiKey);
  return {
    definition: wikiGenerateToolDefinition,
    handler: (args: unknown) =>
      handler.execute(
        args as {
          source_path: string;
          output_dir?: string;
          profile?: 'extended' | 'full';
        }
      ),
  };
}

export function createWikiSearchTool() {
  const handler = new WikiSearchToolHandler();
  return {
    definition: wikiSearchToolDefinition,
    handler: (args: unknown) =>
      handler.execute(
        args as {
          wiki_path: string;
          arc_type?: string;
          emotional_weight_min?: number;
          identity_thread?: string;
          recurrence_pattern?: 'acute' | 'cyclical' | 'chronic';
          limit?: number;
        }
      ),
  };
}

export function createWikiLintTool() {
  const handler = new WikiLintToolHandler();
  return {
    definition: wikiLintToolDefinition,
    handler: (args: unknown) =>
      handler.execute(args as { wiki_path: string }),
  };
}
