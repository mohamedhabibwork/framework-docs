# Documentation & UI upgrade — October 2026

Audit and upgrade of the repository documentation and the Starlight documentation
site. This is a report, not a guide: it records what changed, why, and what is
still open.

## 1. What the audit found

**Structure**

- 21 guides, but no entry point: `README.md` was a flat table, `docs/` had no
  index, and nine guides (authentication, cache, storage, mail, notifications,
  queues, workflows, scheduling, logging) existed **only** on the site — invisible
  on GitHub and to the MCP server.
- The site sidebar mixed two reading models: flat links plus two collapsible
  groups, with no grouping by task.
- Documentation was duplicated: `docs/*.md` and `apps/docs/.../*.mdx` were
  hand-maintained copies with no guard against drift. `decisions.mdx` had already
  drifted — it was missing ADR-11 and ADR-16…21.

**Accuracy**

- `status.md` claimed the docs site ran on the Cloudflare adapter and wrangler; it
  is a static nginx build on Dokploy.
- `cli-reference.md` said tooling delegates to `biome`; the project uses `oxlint`
  and `oxfmt`.
- `cli-reference.md` said `--access authenticated` was not available yet; it
  shipped with `make:auth`.
- `cli-reference.md` documented ~30 of 89 catalog commands (74 implemented).
- `status.md` listed 20 of 25 packages and put a prose paragraph **inside** a
  table, breaking the render.
- `status.md` counted tests ("427 tests") — a number that drifts with every commit.
- `platform.md` said the workflow admin routes were "unprotected until Phase 3";
  mount-time authorization is now required.
- `@framework/observatory` and `@framework/socialite` are contracts-only, but
  nothing said so.

**Rendering / UX (measured on the built site)**

- Every page rendered **two `<h1>`s** (frontmatter title + body heading).
- Wide tables were clipped with no scroll container and no keyboard access; the
  `status` page was unreadable at 1440px.
- Code blocks clipped long commands; the content column was capped at ~68ch, which
  squeezed tables and code.
- Header language/theme selects were ellipsised ("glish", "Au…").
- Group chevrons rendered as solid accent blocks.
- Arabic-locale fallback pages were laid out RTL while showing English text.
- The landing page was a generic splash: staggered cards, emoji-coloured icons,
  no install path, no package overview.
- No focus-visible styling beyond browser defaults, no reduced-motion handling,
  no print styles.

## 2. Documentation changes

**One source of truth.** `docs/*.md` is canonical; the site is generated.

- `apps/docs/scripts/docs-lib.ts` — page manifest (23 pages), link rewriting
  (`.md` → route, repo files → GitHub), H1 stripping, package-table splicing,
  oxfmt formatting.
- `bun run docs:sync` regenerates `apps/docs/src/content/docs/*.mdx`.
- `bun run docs:check` re-runs the transform and fails on drift, plus eight other
  invariants (see §4).
- The nine site-only guides were reverse-migrated into `docs/` so GitHub, the site
  and the MCP server serve the same text.

**New pages**

| Page                     | Why                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `docs/README.md`         | Documentation hub: map, reading paths, conventions, how to add a page                                |
| `docs/packages.md`       | All 25 packages with status and dependency graph; table generated from `src/data/packages.ts`        |
| `docs/errors.md`         | Error envelope, the 18-code catalog, validation details, client handling, OpenAPI mapping            |
| `docs/search.md`         | Config, `defineSearchIndex`, `Searchable`, querying, event-driven indexing, rebuilds, limits         |
| `docs/oauth-server.md`   | Config, mounting, the six endpoints, grants, client registration, token verification, security notes |
| `docs/ai.md` (rewritten) | MCP tools table, resources, embedding contract, agent loop, design rules                             |

**Rewrites and corrections**

- `cli-reference.md` — restructured; **complete command index (74 implemented
  commands)** generated from `bun run cli -- list`, new sections for auth, jobs,
  seeders, `db:seed`/`db:fresh`, queue administration, schedules, workflows,
  search, maintenance and `build`; corrected tooling names and `--access`.
- `status.md` — rebuilt: four-state classification (validated / implemented /
  contracts / planned), complete package table, the broken table repaired, test
  counts removed in favour of the command that produces them, docs-site
  description corrected, duplicated command rows merged.
- `getting-started.md` — prerequisites table with versions, a "when it does not
  start" troubleshooting table, and a note that the docs site (not the app) needs
  Node ≥ 22.23.4.
- `platform.md` — authorization requirement for admin route families corrected.
- `README.md` — rewritten: quickstart, documentation map, layout, checks, package
  repository table, contribution rules.
- `CONTRIBUTING.md`, `apps/docs/README.md`, `apps/docs/AGENTS.md` — updated to the
  generated-docs workflow and the design system.

## 3. UI / UX changes

**Design system** (`src/styles/`, four cascade layers)

- `tokens.css` — "Ember & Ink" palette for both themes, fluid type scale, spacing,
  radii, shadows; all Starlight variables remapped. Body text pairs are
  contrast-checked (dark 8–16:1, light 6–16:1); a separate `--jade-text` exists
  because the raw accent jade is unreadable as text on light surfaces.
- Typography — self-hosted variable fonts (Fraunces display, Plex Sans body,
  JetBrains Mono code), preloaded, no third-party requests.
- `base.css` — sticky translucent header, mono eyebrow group labels, active item
  with an ember rule, quiet TOC, pagination cards, one global focus ring,
  reduced-motion and print rules.
- `prose.css` — editorial h2/h3, readable measure for prose only (tables and code
  take the full column), bordered tables with hover rows, inline-code pills,
  tinted asides, equal-height cards, link-card styling.
- `landing.css` — asymmetric hero (copy + real terminal transcript), section
  kickers, hairline feature grid, two entry paths, package pills, docs map.

**Landing page** — rebuilt from a generic splash into a task-oriented page: what
ships, two ways in, the package catalog, and a docs map, all linking to real pages.

**Accessibility**

- One `<h1>` per page; heading levels normalised.
- Skip link styled; visible `:focus-visible` on every interactive element.
- Tables wrapped in `role="region"` scroll containers with `aria-label` derived
  from the header row and `tabindex="0"` (keyboard scrollable).
- `prefers-reduced-motion` disables every animation and transition.
- External links get `rel="noopener noreferrer"`.
- RTL: fallback pages switch to LTR before first paint; the translation manifest
  (`src/data/i18n.ts`) is verified against the `ar/` directory.
- Colour is never the only signal: status uses words, not just colour.

**Responsiveness**

- Hero collapses to a single `minmax(0, 1fr)` column; the terminal transcript wraps
  with a hanging indent instead of hiding half of each command.
- Tables scroll inside their container; the page itself never gains a horizontal
  scrollbar (verified at 390px: `scrollWidth === clientWidth`).
- Header controls sized so labels are never ellipsised.

**Performance / hygiene**

- Three variable fonts (~120 KB total), preloaded; no external font or icon
  requests.
- No client framework; the only JS is ~30 lines of progressive enhancement in the
  document head.
- Static output unchanged (`output: 'static'`, nginx, Dokploy).

## 4. Guard rails

`bun run docs:check` fails on:

1. a generated page that no longer matches its Markdown source;
2. missing `title` or `description` frontmatter;
3. a body `# heading` duplicating the title (code fences excluded);
4. a sidebar entry pointing at a missing page;
5. a page that no sidebar entry reaches (orphan);
6. an internal link to a route that is not built;
7. a package directory missing from the catalog, or a catalog entry without a
   directory;
8. a guide in `docs/` that is not published;
9. an Arabic translation missing from the RTL manifest.

CI (`docs.yml`) runs `docs:check` before the build and pins Node 24 for Astro;
`bun run format:check` and `bun run lint` stay green because generated pages are
formatted with the same oxfmt configuration.

## 5. Verification

```text
bun run docs:check     docs:check passed — 26 pages, 25 sidebar entries, 25 packages, 23 generated
bun run format:check   All matched files use the correct format.
bun run lint           Found 0 warnings and 0 errors.
bun run typecheck      clean
bun run docs:build     79 pages built (dark + light, desktop + mobile + RTL reviewed)
```

Visual review: home (dark/light/mobile), getting started, CLI reference,
implementation status, packages (light), errors, Arabic home, Arabic fallback.

## 6. Remaining gaps

- **Package READMEs are boilerplate.** The 25 split-repository READMEs carry
  install instructions only; per-package API references are still missing. The
  catalog page links to guides where they exist and marks the rest with a dash.
- **`observatory` and `socialite` have no guide** because they have no runtime;
  they are documented as contracts in the package table only.
- **Arabic coverage is 2 of 23 pages.** Fallback pages are now LTR, but a real
  translation pass is outstanding.
- **Archived line `v01` falls back to new pages.** Starlight renders any page the
  snapshot lacks, so `/v01/search/` exists even though 0.1 never had search. The
  fix belongs in the snapshot script (freeze the page list), not in the theme.
- **No OpenAPI reference page.** `/openapi:generate` output is documented in the
  CLI reference and platform guide, but the generated spec is not published as a
  browsable reference.
- **Docs are English-only in search.** Pagefind indexes all locales; ranking does
  not distinguish them.
- **Two visual checks are manual**: the terminal transcript and the hero copy are
  hand-tuned at three breakpoints, and there is no visual regression suite.
