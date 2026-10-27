/**
 * Documentation integrity checks. Fails the build (exit 1) on any violation:
 *
 *  1. A generated `.mdx` no longer matches its `docs/*.md` source.
 *  2. A page is missing `title` or `description` frontmatter.
 *  3. A page repeats the title as a body `<h1>` (two competing headings).
 *  4. The sidebar links to a page that does not exist.
 *  5. A page exists but is unreachable from the sidebar (orphan).
 *  6. An internal link points at a route that is not built.
 *  7. A package directory is missing from the catalog.
 *  8. A guide in `docs/` is not part of the generated site.
 *
 * Run: `bun run docs:check` (also part of `bun run docs:build`'s CI job).
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sidebarSlugs } from '../src/data/sidebar';
import { translatedArRoutes } from '../src/data/i18n';
import { packages } from '../src/data/packages';
import {
  PAGES,
  PAGE_BY_SLUG,
  SITE_SLUGS,
  contentDir,
  docsDir,
  listContentPages,
  listPackageDirs,
  readSource,
  renderMdx,
  relativeToRoot,
} from './docs-lib';

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

/* 1 — generated output is current ---------------------------------------- */
for (const page of PAGES) {
  const expected = await renderMdx(page, await readSource(page));
  const target = join(contentDir, `${page.slug}.mdx`);
  let actual: string | null = null;
  try {
    actual = await readFile(target, 'utf8');
  } catch {
    actual = null;
  }
  if (actual === null) fail(`missing generated page ${relativeToRoot(target)} — run \`bun run docs:sync\``);
  else if (actual !== expected) fail(`stale generated page ${relativeToRoot(target)} — run \`bun run docs:sync\``);
}

/* 2, 3, 6 — every content page ------------------------------------------- */
const pages = await listContentPages();
const frontmatter = /^---\n([\s\S]*?)\n---\n/;

for (const slug of pages) {
  const path = join(contentDir, `${slug}.mdx`);
  const text = await readFile(path, 'utf8');
  const match = text.match(frontmatter);

  if (!match) {
    fail(`${slug}.mdx has no frontmatter block`);
  } else {
    const block = match[1];
    if (!/^title:\s*\S/m.test(block)) fail(`${slug}.mdx is missing \`title\``);
    if (!/^description:\s*\S/m.test(block)) fail(`${slug}.mdx is missing \`description\``);
    const body = text.slice(match[0].length);
    // Shell comments inside fenced blocks start with "#" too; drop fences first.
    const prose = body.replace(/```[\s\S]*?```/g, '');
    if (/^#\s+/m.test(prose)) fail(`${slug}.mdx has a body \`# heading\` that duplicates the frontmatter title`);
  }

  for (const [, target] of text.matchAll(/\]\((\/[^)\s]*)\)/g)) {
    const pathname = target.split('#')[0].split('?')[0];
    const segment = pathname.replace(/^\//, '').split('/')[0];
    if (segment === '' || segment.startsWith('fonts') || segment === 'favicon.svg') continue;
    // Archived docs lines are their own Starlight locale (/v01/…) and are not
    // part of SITE_SLUGS; the Arabic locale is a prefix too.
    if (segment === 'v01' || segment === 'ar') continue;
    if (!SITE_SLUGS.has(segment)) fail(`${slug}.mdx links to ${target}, which is not a built route`);
  }

  if (/\]\((?!https?:)[^)\s]*\.md(#|\))/.test(text))
    fail(`${slug}.mdx still contains a relative .md link (run \`bun run docs:sync\`)`);
}

/* 4, 5 — sidebar <-> pages ------------------------------------------------ */
const sidebar = sidebarSlugs();
const sidebarSet = new Set(sidebar);

for (const slug of sidebarSet) {
  if (!SITE_SLUGS.has(slug)) fail(`sidebar links to "${slug}", which has no page`);
}

const siteOnly = new Set(['index', 'releases', 'versions']);
for (const slug of pages) {
  if (siteOnly.has(slug) || !PAGE_BY_SLUG.has(slug)) continue;
  if (!sidebarSet.has(slug)) fail(`page "${slug}" is not reachable from the sidebar`);
}

/* 7 — catalog completeness ------------------------------------------------ */
const packageDirs = await listPackageDirs();
const catalogued = new Set(packages.map((entry) => entry.name));
for (const dir of packageDirs) {
  if (!catalogued.has(dir)) fail(`packages/${dir} is missing from src/data/packages.ts`);
}
for (const name of catalogued) {
  if (!packageDirs.includes(name)) fail(`src/data/packages.ts lists "${name}", which is not a package directory`);
}

/* 8 — every guide is published -------------------------------------------- */
const guides = (await readdir(docsDir)).filter((name) => name.endsWith('.md'));
const publishedSources = new Set(PAGES.map((page) => page.source));
for (const name of guides) {
  // Hub, plan and the upgrade report are repository documents, not site guides.
  if (['README.md', 'enhancement-plan.md', 'documentation-upgrade.md'].includes(name)) continue;
  if (!publishedSources.has(`docs/${name}`)) fail(`docs/${name} is not published (add it to PAGES in sync-docs.ts)`);
}

/* 9 — the Arabic translation manifest matches the content directory -------- */
const arDir = join(contentDir, 'ar');
const arFiles = await readdir(arDir).catch(() => [] as string[]);
const arRoutes = arFiles
  .filter((name) => name.endsWith('.mdx'))
  .map((name) => (name === 'index.mdx' ? '/ar/' : `/ar/${name.replace(/\.mdx$/, '')}/`))
  .sort();
const declaredAr = [...translatedArRoutes].sort();
if (arRoutes.join('|') !== declaredAr.join('|')) {
  fail(
    `src/data/i18n.ts translatedArRoutes (${declaredAr.join(', ') || 'none'}) does not match src/content/docs/ar (${arRoutes.join(', ') || 'none'})`,
  );
}

/* ------------------------------------------------------------------------ */
if (problems.length > 0) {
  console.error(`docs:check failed with ${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`  • ${problem}`);
  process.exit(1);
}

console.log(
  `docs:check passed — ${pages.length} pages, ${sidebarSet.size} sidebar entries, ${packages.length} packages, ${PAGES.length} generated`,
);
