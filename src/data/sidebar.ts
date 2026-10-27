/**
 * The docs sidebar, generated from the version manifest so every docs line
 * gets the same structure. `astro.config.mjs` calls `sidebarFor()` with
 * `docsVersions.latest`; frozen snapshots (`v01`, `v02`, ...) pass their own
 * line — today the entries are identical because snapshots mirror the EN tree,
 * but keeping the line argument lets a future snapshot diverge its sidebar
 * without touching the config.
 *
 * Information architecture (five groups, task-oriented):
 *   Start here  — orientation: what it is, first running API
 *   Concepts    — the mental model: helpers, modules, kernel, auth, errors
 *   Features    — one page per subsystem an application turns on
 *   Operations  — CLI, tests, deploys, agent tooling
 *   Reference   — catalogs and history: packages, versions, status, ADRs
 *
 * Note: Starlight 0.42 applies one sidebar array to every locale (there is no
 * per-locale sidebar object), so `ar` and archived locales receive this same
 * array and slug entries fall back to the default-locale pages.
 */

/** Starlight sidebar item as accepted by the `sidebar` config option. */
type SidebarItem =
  | { label: string; link: string }
  | { label: string; slug: string }
  | { label: string; items: SidebarItem[]; collapsed?: boolean };

const start: SidebarItem[] = [
  { label: 'Introduction', link: '/' },
  { label: 'Getting started', slug: 'getting-started' },
];

const concepts: SidebarItem[] = [
  { label: 'Helpers', slug: 'helpers' },
  { label: 'Authoring modules', slug: 'modules' },
  { label: 'Platform guide', slug: 'platform' },
  { label: 'Authentication', slug: 'authentication' },
  { label: 'Errors & codes', slug: 'errors' },
];

const features: SidebarItem[] = [
  { label: 'Cache', slug: 'cache' },
  { label: 'Storage', slug: 'storage' },
  { label: 'Mail', slug: 'mail' },
  { label: 'Notifications', slug: 'notifications' },
  { label: 'Logging', slug: 'logging' },
  { label: 'Search', slug: 'search' },
  { label: 'Queues', slug: 'queues' },
  { label: 'Workflows', slug: 'workflows' },
  { label: 'Scheduling', slug: 'scheduling' },
  { label: 'OAuth server', slug: 'oauth-server' },
];

const operations: SidebarItem[] = [
  { label: 'CLI reference', slug: 'cli-reference' },
  { label: 'Testing', slug: 'testing' },
  { label: 'Deployment', slug: 'deployment' },
  { label: 'AI integration', slug: 'ai' },
];

const reference: SidebarItem[] = [
  { label: 'Packages', slug: 'packages' },
  { label: 'Versions', slug: 'versions' },
  { label: 'Releases', slug: 'releases' },
  { label: 'Implementation status', slug: 'status' },
  { label: 'Architecture decisions', slug: 'decisions' },
];

/** The full sidebar for a docs line (latest or archived snapshot). */
export function sidebarFor(_line: string): SidebarItem[] {
  return [
    { label: 'Start here', items: start },
    { label: 'Concepts', items: concepts },
    { label: 'Features', items: features },
    { label: 'Operations', items: operations },
    { label: 'Reference', items: reference },
  ];
}

/**
 * Every slug the sidebar links to — used by `scripts/check-docs.ts` to prove
 * that no page is orphaned and no entry points at a missing page.
 */
export function sidebarSlugs(): string[] {
  const out: string[] = [];
  const visit = (items: SidebarItem[]) => {
    for (const item of items) {
      if ('items' in item) visit(item.items);
      else if ('slug' in item) out.push(item.slug);
    }
  };
  visit(sidebarFor('latest'));
  return out;
}
