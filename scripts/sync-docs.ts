/**
 * Generates `src/content/docs/<slug>.mdx` from the canonical `docs/<slug>.md`.
 *
 *   bun run docs:sync          # write the generated pages
 *   bun run docs:sync --check  # exit 1 when a generated page is stale
 *
 * The transform is pure (see `docs-lib.ts`), so `check-docs.ts` can compare the
 * committed output byte for byte.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PAGES, contentDir, readSource, renderMdx, relativeToRoot } from './docs-lib';

const checkOnly = process.argv.includes('--check');
let stale = 0;
let written = 0;

for (const page of PAGES) {
  const target = join(contentDir, `${page.slug}.mdx`);
  const expected = await renderMdx(page, await readSource(page));

  let current: string | null = null;
  try {
    current = await readFile(target, 'utf8');
  } catch {
    current = null;
  }

  if (current === expected) continue;

  if (checkOnly) {
    stale += 1;
    console.error(`stale: ${relativeToRoot(target)} (run \`bun run docs:sync\`)`);
    continue;
  }

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, expected, 'utf8');
  written += 1;
  console.log(`${current === null ? 'created' : 'updated'} ${relativeToRoot(target)}`);
}

if (checkOnly) {
  if (stale > 0) process.exit(1);
  console.log(`docs in sync (${PAGES.length} generated pages)`);
} else {
  console.log(`docs sync: ${written} file(s) written, ${PAGES.length - written} already current`);
}
