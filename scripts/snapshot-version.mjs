#!/usr/bin/env bun
/**
 * Freeze the current English docs as an archived version line (Laravel-style
 * docs snapshot). NOT meant to be run by hand — the root release script
 * (`bun run release -- <version>`) invokes this whenever a pre-1.0 release
 * bumps the minor, and it is the only supported entry point.
 *
 * Usage: bun apps/docs/scripts/snapshot-version.mjs <new-line> [--dry]
 *   e.g. when releasing 0.2.0:  snapshot-version.mjs 0.2
 *
 * `<new-line>` is the line being RELEASED. The CURRENT `latest` (read from
 * src/data/versions.ts, e.g. `0.1`) is the line that gets archived. Passing
 * the line that is already `latest` is refused — there would be nothing to
 * archive. After a successful run:
 *
 *   1. every EN page in src/content/docs/ is copied to src/content/docs/v<xx>/
 *      (a Starlight locale directory — the docs loader only globs inside
 *      src/content/docs, so the snapshot must live there to be routable at
 *      /v<xx>/...);
 *   2. astro.config.mjs gains/updates the locale entry
 *      `v<xx>: { label: 'v0.1', lang: 'en' }` (idempotent; `lang: 'en'` keeps
 *      LTR text direction and EN UI strings for the snapshot);
 *   3. src/data/versions.ts is rewritten: `latest` becomes <new-line> and the
 *      archived line is kept in `lines` (newest first).
 *
 * Nothing is committed — the release script folds these changes into the
 * `chore(release)` commit.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const docsRoot = resolve(import.meta.dirname, '..');
const contentDocs = join(docsRoot, 'src', 'content', 'docs');
const versionsTs = join(docsRoot, 'src', 'data', 'versions.ts');
const astroConfig = join(docsRoot, 'astro.config.mjs');

const dry = process.argv.includes('--dry');
const args = process.argv.slice(2).filter((arg) => arg !== '--dry');
const newLine = args[0];

function fail(message) {
	console.error(`snapshot-version: ${message}`);
	console.error('Usage: bun apps/docs/scripts/snapshot-version.mjs <new-line> [--dry]');
	process.exit(1);
}

if (!newLine) fail('missing <new-line> argument (e.g. 0.2)');
if (!/^\d+\.\d+$/.test(newLine)) fail(`"${newLine}" is not a docs line like 0.2`);
if (!existsSync(contentDocs) || !existsSync(versionsTs) || !existsSync(astroConfig)) {
	fail(`run this script from the repository; expected ${docsRoot} to be the docs app`);
}

const versionsSource = readFileSync(versionsTs, 'utf8');
const latest = versionsSource.match(/latest:\s*'([^']+)'/)?.[1];
const linesMatch = versionsSource.match(/lines:\s*\[([^\]]*)\]/);
if (!latest || !linesMatch) fail('could not parse src/data/versions.ts');
if (newLine === latest) {
	fail(`"${newLine}" is already the latest docs line — pass the line being released`);
}

// The archived line is the current latest, e.g. 0.1 → locale v01, dir docs/v01.
const archived = latest;
const localeId = `v${archived.replaceAll('.', '')}`;
const localeLabel = `v${archived}`;
const snapshotDir = join(contentDocs, localeId);

if (existsSync(snapshotDir)) fail(`snapshot directory already exists: ${snapshotDir}`);

const enPages = readdirSync(contentDocs, { withFileTypes: true })
	.filter((entry) => entry.isFile() && entry.name.endsWith('.mdx'))
	.map((entry) => entry.name)
	.sort();
if (enPages.length === 0) fail(`no English .mdx pages found in ${contentDocs}`);

// Next line list: new line first, then every existing line (the archived one
// is already among them, but include it defensively).
const existingLines = linesMatch[1]
	.split(',')
	.map((part) => part.trim().replaceAll("'", ''))
	.filter(Boolean);
const nextLines = [newLine, ...new Set([...existingLines, archived])];

console.log(`Archiving docs line ${archived} as locale ${localeId}; latest becomes ${newLine}.`);
console.log(`  ${enPages.length} EN pages → src/content/docs/${localeId}/`);
for (const page of enPages) console.log(`    - ${page}`);

if (!dry) {
	mkdirSync(snapshotDir, { recursive: true });
	for (const page of enPages) {
		cpSync(join(contentDocs, page), join(snapshotDir, page));
	}

	// 1. astro.config.mjs — upsert the locale entry right after the `ar` entry
	//    (falls back to after `root` if ar ever disappears). Idempotent: an
	//    existing `v<xx>:` entry is replaced in place.
	let config = readFileSync(astroConfig, 'utf8');
	const localeEntry = `${localeId}: { label: '${localeLabel}', lang: 'en' },`;
	const entryPattern = new RegExp(`^[ \\t]*${localeId}:\\s*\\{[^}]*\\},?[ \\t]*\\n`, 'm');
	if (entryPattern.test(config)) {
		config = config.replace(entryPattern, `\t\t\t\t${localeEntry}\n`);
	} else {
		const arPattern = /^[ \t]*ar:[ \t]*\{.*\},?[ \t]*\n/m;
		const rootPattern = /^[ \t]*root:[ \t]*\{.*\},?[ \t]*\n/m;
		const anchorPattern = arPattern.test(config) ? arPattern : rootPattern;
		const anchor = config.match(anchorPattern);
		if (!anchor) fail('could not find the locales block in astro.config.mjs');
		config = config.replace(anchorPattern, `${anchor[0]}\t\t\t\t${localeEntry}\n`);
	}
	writeFileSync(astroConfig, config);

	// 2. versions.ts — swap latest and rebuild the lines list.
	writeFileSync(
		versionsTs,
		versionsSource
			.replace(/latest:\s*'[^']+'/, `latest: '${newLine}'`)
			.replace(/lines:\s*\[[^\]]*\]/, `lines: [${nextLines.map((line) => `'${line}'`).join(', ')}]`),
	);
}

console.log(dry ? 'Dry run — nothing written.' : 'Snapshot written.');
console.log('Not done here (release script handles it): git commit, git tag, deploy.');
