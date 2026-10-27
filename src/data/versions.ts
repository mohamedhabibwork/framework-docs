/**
 * Single source of truth for documentation versioning (Laravel-style minor
 * snapshots). Everything that needs to know "which docs lines exist" reads
 * from here:
 *
 * - `astro.config.mjs` derives the root locale label and the sidebar.
 * - `src/components/VersionPicker.astro` renders the version pill.
 * - `scripts/snapshot-version.mjs` rewrites `latest`/`lines` when a release
 *   archives the previous line (see that script — run only by the release
 *   flow, never by hand).
 *
 * This file is imported both by TS (Astro components) and by ESM
 * (astro.config.mjs is bundled by Astro's config loader, which resolves .ts
 * imports), so keep it dependency-free.
 *
 * Invariants maintained by the snapshot script:
 * - `latest` is the docs line served at the site root (`/`).
 * - `lines[0] === latest`; the remaining entries are archived lines, newest
 *   first, each served from its Starlight locale (`0.1` → `/v01/...`).
 */
export const docsVersions = {
	/** The docs line matching the current framework release. */
	latest: '0.2',
	/** Every docs line, newest first. */
	lines: ['0.2', '0.1'],
} as const;

export type DocsVersionLine = (typeof docsVersions.lines)[number];

/** `0.1` → `v0.1` — the display form used in labels and prose. */
export function formatLine(line: string): string {
	return `v${line}`;
}

/** `0.1` → `v01` — the Starlight locale id for a frozen docs line. */
export function localeIdFor(line: string): string {
	return `v${line.replaceAll('.', '')}`;
}

/**
 * Content directory holding a frozen line, relative to `src/content/`:
 * `0.1` → `docs/v01`. Starlight's docs loader globs `src/content/docs/**`,
 * so snapshots must live inside that collection to be routable.
 */
export function localeDirFor(line: string): string {
	return `docs/${localeIdFor(line)}`;
}

/** True for every known line except the latest one. */
export function isArchived(line: string): boolean {
	return line !== docsVersions.latest && (docsVersions.lines as readonly string[]).includes(line);
}
