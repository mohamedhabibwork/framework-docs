/**
 * Shared machinery for `sync-docs.ts` and `check-docs.ts`.
 *
 * The repository keeps one canonical copy of every guide: `docs/<slug>.md`,
 * readable on GitHub and served to AI agents over MCP. The Starlight site needs
 * `.mdx` with frontmatter and route-style links, so it is *generated* — never
 * hand-edited. `check-docs.ts` re-runs the same transform and fails when the
 * committed output has drifted.
 */
import { readFile, readdir } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, type FormatConfig } from 'oxfmt';
import { packages } from '../src/data/packages';

export const docsAppDir = join(dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = join(docsAppDir, '..', '..');
export const contentDir = join(docsAppDir, 'src', 'content', 'docs');
export const docsDir = join(repoRoot, 'docs');

/** GitHub fallback for links to repository files that are not site pages. */
const REPO_BLOB = 'https://github.com/mohamedhabibwork/framework/blob/main/';

export interface PageMeta {
  /** Route slug: `oauth-server` → `/oauth-server/`. */
  readonly slug: string;
  /** Canonical markdown source, relative to the repository root. */
  readonly source: string;
  readonly title: string;
  readonly description: string;
}

/**
 * Every generated page. `releases` and `versions` are site-only (they carry
 * MDX components and release history) and are deliberately absent.
 */
export const PAGES: readonly PageMeta[] = [
  {
    slug: 'getting-started',
    source: 'docs/getting-started.md',
    title: 'Getting started',
    description: 'From zero to a running API: the reference app, generated apps and what ships with them.',
  },
  {
    slug: 'helpers',
    source: 'docs/helpers.md',
    title: 'Helpers',
    description: 'Laravel-style config(), env(), abort(), logger(), retry() and execution-context helpers.',
  },
  {
    slug: 'cli-reference',
    source: 'docs/cli-reference.md',
    title: 'CLI reference',
    description: 'Every command, option and example of the application CLI.',
  },
  {
    slug: 'modules',
    source: 'docs/modules.md',
    title: 'Authoring modules',
    description: 'Module anatomy, the Drizzle-to-Zod pipeline, mixins, hooks, policies and OpenAPI.',
  },
  {
    slug: 'platform',
    source: 'docs/platform.md',
    title: 'Platform guide',
    description: 'Request context, errors, pagination, filtering, audit trail, events, queues and import/export.',
  },
  {
    slug: 'authentication',
    source: 'docs/authentication.md',
    title: 'Authentication',
    description: 'Session and personal API token authentication: hashing, guards, throttling and the /auth endpoints.',
  },
  {
    slug: 'logging',
    source: 'docs/logging.md',
    title: 'Logging',
    description: 'Structured, redacted, correlation-aware logging: levels, sinks and ambient execution context.',
  },
  {
    slug: 'errors',
    source: 'docs/errors.md',
    title: 'Errors & codes',
    description: 'The error envelope, the stable code catalog, validation details and client handling.',
  },
  {
    slug: 'cache',
    source: 'docs/cache.md',
    title: 'Cache',
    description: 'Application cache, distributed locks and rate limiting on one driver: memory or Redis.',
  },
  {
    slug: 'storage',
    source: 'docs/storage.md',
    title: 'Storage',
    description: 'File storage disks with visibility separation, path safety and multi-driver configuration.',
  },
  {
    slug: 'mail',
    source: 'docs/mail.md',
    title: 'Mail',
    description: 'Validated email messages, a fluent composer and pluggable transports.',
  },
  {
    slug: 'notifications',
    source: 'docs/notifications.md',
    title: 'Notifications',
    description: 'Multi-channel notifications with a per-channel delivery-status ledger and queued delivery.',
  },
  {
    slug: 'search',
    source: 'docs/search.md',
    title: 'Search',
    description: 'Declarative indexes, memory and PostgreSQL drivers, event-driven indexing and rebuilds.',
  },
  {
    slug: 'queues',
    source: 'docs/queues.md',
    title: 'Queues',
    description: 'Versioned jobs, retries, timeouts, batches and workers over BullMQ and Redis.',
  },
  {
    slug: 'workflows',
    source: 'docs/workflows.md',
    title: 'Workflows',
    description:
      'Durable multi-step runs with checkpoints, pipelines, parallel groups, sagas and wait-for-event stages.',
  },
  {
    slug: 'scheduling',
    source: 'docs/scheduling.md',
    title: 'Scheduling',
    description:
      'Cron timetables that dispatch jobs or workflows, with overlap protection and safe multi-process fires.',
  },
  {
    slug: 'oauth-server',
    source: 'docs/oauth-server.md',
    title: 'OAuth server',
    description: 'Authorization code with PKCE, client credentials, refresh tokens, introspection and revocation.',
  },
  {
    slug: 'testing',
    source: 'docs/testing.md',
    title: 'Testing',
    description: 'Isolated PostgreSQL databases, endpoint suites, test modes and release gates.',
  },
  {
    slug: 'deployment',
    source: 'docs/deployment.md',
    title: 'Deployment',
    description: 'Processes, configuration, migrations as a release step, health checks and scaling.',
  },
  {
    slug: 'ai',
    source: 'docs/ai.md',
    title: 'AI integration',
    description: 'The MCP server, its tools and resources, and the agent skills shipped with the repository.',
  },
  {
    slug: 'packages',
    source: 'docs/packages.md',
    title: 'Packages',
    description: 'What each package does, its delivery status and how the packages depend on each other.',
  },
  {
    slug: 'status',
    source: 'docs/status.md',
    title: 'Implementation status',
    description: 'What is validated, implemented or planned, with the evidence for each claim.',
  },
  {
    slug: 'decisions',
    source: 'docs/architecture/decisions.md',
    title: 'Architecture decisions',
    description: 'The ADR log: runtime, adapters, security defaults and package boundaries.',
  },
];

export const PAGE_BY_SLUG = new Map(PAGES.map((page) => [page.slug, page]));

/** Slugs that resolve to a page on the site (used to validate links). */
export const SITE_SLUGS = new Set<string>([...PAGE_BY_SLUG.keys(), 'releases', 'versions']);

const STATUS_LABEL: Record<string, string> = {
  validated: 'Validated',
  implemented: 'Implemented',
  contracts: 'Contracts only',
};

/** Markdown table of the package catalog, rendered from `src/data/packages.ts`. */
export function packagesTable(): string {
  const head = ['Package', 'What it does', 'Status', 'Guide'];
  const rows = packages.map((entry) => [
    `\`${entry.id}\``,
    entry.summary,
    STATUS_LABEL[entry.status] ?? entry.status,
    entry.guide ? `[Read](${entry.guide.replace(/^\//, '').replace(/\/$/, '')}.md)` : '—',
  ]);
  const widths = head.map((_, column) => Math.max(...[head, ...rows].map((row) => row[column].length)));
  const line = (cells: string[]) => `| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(' | ')} |`;
  return [line(head), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)].join('\n');
}

/** Replaces the generated region of `docs/packages.md`. */
export function injectPackagesTable(markdown: string): string {
  const start = '<!-- packages:start -->';
  const end = '<!-- packages:end -->';
  const from = markdown.indexOf(start);
  const to = markdown.indexOf(end);
  if (from === -1 || to === -1) {
    throw new Error(`docs/packages.md is missing the ${start} / ${end} markers`);
  }
  return `${markdown.slice(0, from + start.length)}\n\n${packagesTable()}\n\n${markdown.slice(to)}`;
}

/**
 * Rewrites repository-relative links into site routes:
 *   platform.md            → /platform/
 *   platform.md#audit      → /platform/#audit
 *   architecture/decisions.md → /decisions/
 *   ../framwork.md         → GitHub blob URL
 * External, anchor-only and image links are left alone.
 */
export function rewriteLinks(markdown: string): string {
  return markdown.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (match, bang, text, target) => {
    if (bang === '!') return match;
    if (/^[a-z]+:/i.test(target) || target.startsWith('#') || target.startsWith('/')) return match;

    const [path, anchor] = target.split('#');
    const suffix = anchor ? `#${anchor}` : '';
    const file = path.replace(/^\.\//, '');

    if (file.endsWith('.md')) {
      const slug = basename(file, '.md');
      if (SITE_SLUGS.has(slug)) return `[${text}](/${slug}/${suffix})`;
      const isAdr = file.includes('architecture/');
      if (isAdr) return `[${text}](/decisions/${suffix})`;
    }

    // Anything else is a repository file: point at GitHub so the link survives.
    const cleaned = file.replace(/^(\.\.\/)+/, '');
    return `[${text}](${REPO_BLOB}${cleaned}${suffix})`;
  });
}

/** Removes the leading `# Title` line (the site renders the frontmatter title). */
export function stripH1(markdown: string): string {
  return markdown.replace(/^#\s+.*\r?\n+/, '');
}

/**
 * The docs app formats with its own `.oxfmtrc.json`; generated pages are run
 * through the same formatter so `docs:sync` and `bun run format` never fight
 * over whitespace or table alignment.
 */
let formatterOptions: FormatConfig | undefined;

async function formatterConfig(): Promise<FormatConfig> {
  if (formatterOptions) return formatterOptions;
  const raw = JSON.parse(await readFile(join(docsAppDir, '.oxfmtrc.json'), 'utf8')) as Record<string, unknown>;
  const { $schema: _schema, ignorePatterns: _ignored, ...rest } = raw;
  formatterOptions = rest as FormatConfig;
  return formatterOptions;
}

/** Single-quoted YAML scalar, matching the formatter's output. */
function yamlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Builds the MDX file for a page, formatted exactly as `oxfmt` would leave it.
 * `sync` writes the result; `check` compares it byte for byte.
 */
export async function renderMdx(page: PageMeta, source: string): Promise<string> {
  const withTable = page.slug === 'packages' ? injectPackagesTable(source) : source;
  // The generation markers are valid HTML comments (GitHub) but invalid MDX;
  // they exist only so `sync` knows where to splice the table.
  const cleaned = withTable.replace(/^<!-- packages:(?:start|end) -->\n?/gm, '');
  const body = rewriteLinks(stripH1(cleaned)).trimEnd();
  // Single-quoted YAML with a blank line after the block: this is exactly what
  // oxfmt produces, so `docs:sync` and `bun run format` are idempotent together.
  const frontmatter = [
    '---',
    `title: ${yamlString(page.title)}`,
    `description: ${yamlString(page.description)}`,
    '---',
    '',
    '',
  ].join('\n');
  const raw = `${frontmatter}${body}\n`;
  const { code, errors } = await format(`${page.slug}.mdx`, raw, await formatterConfig());
  if (errors.length > 0) {
    throw new Error(`failed to format generated page ${page.slug}.mdx: ${errors[0]?.message ?? 'unknown error'}`);
  }
  return code;
}

export async function readSource(page: PageMeta): Promise<string> {
  return readFile(join(repoRoot, page.source), 'utf8');
}

/** All `.mdx` pages currently in the content collection, excluding archives. */
export async function listContentPages(): Promise<string[]> {
  const entries = await readdir(contentDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mdx'))
    .map((entry) => entry.name.replace(/\.mdx$/, ''))
    .sort();
}

/** Package directories on disk, used to prove the catalog is complete. */
export async function listPackageDirs(): Promise<string[]> {
  const entries = await readdir(join(repoRoot, 'packages'), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function relativeToRoot(path: string): string {
  return relative(repoRoot, path);
}
