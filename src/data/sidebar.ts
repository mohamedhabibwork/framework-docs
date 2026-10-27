/**
 * The docs sidebar, generated from the version manifest so every docs line
 * gets the same structure. `astro.config.mjs` calls `sidebarFor()` with
 * `docsVersions.latest`; frozen snapshots (`v01`, `v02`, ...) pass their own
 * line — today the entries are identical because snapshots mirror the EN tree,
 * but keeping the line argument lets a future snapshot diverge its sidebar
 * without touching the config.
 *
 * Note: Starlight 0.42 applies one sidebar array to every locale (there is no
 * per-locale sidebar object), so `ar` and archived locales receive this same
 * array and slug entries fall back to the default-locale pages.
 */

/** Starlight sidebar item as accepted by the `sidebar` config option. */
type SidebarItem = { label: string; link: string } | { label: string; slug: string };

const guides: SidebarItem[] = [
	{ label: 'Cache', slug: 'cache' },
	{ label: 'Storage', slug: 'storage' },
	{ label: 'Mail', slug: 'mail' },
	{ label: 'Notifications', slug: 'notifications' },
	{ label: 'Authentication', slug: 'authentication' },
	{ label: 'Logging', slug: 'logging' },
	{ label: 'Queues', slug: 'queues' },
	{ label: 'Workflows', slug: 'workflows' },
	{ label: 'Scheduling', slug: 'scheduling' },
];

const reference: SidebarItem[] = [
	{ label: 'Versions', slug: 'versions' },
	{ label: 'Releases', slug: 'releases' },
	{ label: 'Implementation status', slug: 'status' },
	{ label: 'Architecture decisions', slug: 'decisions' },
];

/** The full sidebar for a docs line (latest or archived snapshot). */
export function sidebarFor(_line: string): SidebarItem[] {
	return [
		{ label: 'Introduction', link: '/' },
		{ label: 'Getting started', slug: 'getting-started' },
		{ label: 'Guides', items: guides },
		{ label: 'Helpers', slug: 'helpers' },
		{ label: 'CLI reference', slug: 'cli-reference' },
		{ label: 'Authoring modules', slug: 'modules' },
		{ label: 'Platform guide', slug: 'platform' },
		{ label: 'Testing', slug: 'testing' },
		{ label: 'Deployment', slug: 'deployment' },
		{ label: 'Reference', items: reference },
	];
}
