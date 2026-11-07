# Working in `apps/docs`

Starlight (Astro 7) site that renders the guides from the repository's `docs/`
directory. This file covers the project-specific rules; Astro/Starlight API
questions are answered at https://docs.astro.build and https://starlight.astro.build.

## Generated content — do not hand-edit

`src/content/docs/*.mdx` (except `index.mdx`, `releases.mdx`, `versions.mdx`,
`ar/**` and the archived `v01/**` snapshot) is generated from `docs/*.md`:

```sh
bun run docs:sync     # regenerate
bun run docs:check    # verify (also fails on broken links, orphan pages…)
```

Edit the Markdown in `docs/`, then sync. The transform lives in
`scripts/docs-lib.ts` (`PAGES` is the manifest: slug → source → title →
description).

## Structure

| Path                   | Role                                                                          |
| ---------------------- | ----------------------------------------------------------------------------- |
| `astro.config.mjs`     | Starlight config: sidebar, locales, head meta, inline scripts                 |
| `src/data/sidebar.ts`  | Navigation groups (Start here / Concepts / Features / Operations / Reference) |
| `src/data/versions.ts` | Docs version manifest (release script maintains it)                           |
| `src/data/packages.ts` | Package catalog → landing pills + `/packages/` table                          |
| `src/data/i18n.ts`     | Which `/ar/` routes are really translated (RTL opt-in)                        |
| `src/styles/*.css`     | Design system, loaded in cascade order                                        |
| `src/components/`      | `SiteTitle` override and landing-page components                              |
| `scripts/`             | `sync-docs.ts`, `check-docs.ts`, `docs-lib.ts`                                |

## Design system

Four layers, applied in this order by `customCss`:

1. `tokens.css` — fonts, palette, spacing, Starlight variable overrides.
2. `base.css` — header, sidebar, TOC, pagination, focus states, motion, print.
3. `prose.css` — Markdown content: headings, code, tables, asides, cards.
4. `landing.css` — the splash page only, scoped under `.landing`.

Rules:

- **Colour only through tokens.** No hex values in components; both themes must
  stay AA-contrast for body text.
- **Fonts are self-hosted** in `public/fonts/*.woff2` (Fraunces display, Plex
  Sans body, JetBrains Mono code). No external font requests.
- **Motion is optional**: everything animated sits behind
  `prefers-reduced-motion: no-preference`, and the global reduce block kills
  transitions.
- **Tables** get a focusable scroll region from the inline enhancement script in
  `astro.config.mjs`; style the `table` itself so the wrapper adds no layout.

## Development

```sh
astro dev --background     # then: astro dev stop | status | logs
```

The site needs Node ≥ 22.23.4 (Astro 7); the rest of the repository runs on Bun.
