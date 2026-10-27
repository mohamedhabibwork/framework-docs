# Framework Documentation (`mohamedhabibwork/framework-docs`)

Documentation site and Markdown guides for [**mohamedhabibwork/framework**](https://github.com/mohamedhabibwork/framework) — a Laravel-inspired TypeScript framework built on Bun, Hono, Drizzle ORM and Zod.

## Ecosystem Links

- **Live Documentation**: [https://framework.habib.cloud](https://framework.habib.cloud)
- **Main Framework Repository**: [mohamedhabibwork/framework](https://github.com/mohamedhabibwork/framework)
- **Starter Application Template**: [mohamedhabibwork/framework-app](https://github.com/mohamedhabibwork/framework-app)
- **Documentation Repository**: [mohamedhabibwork/framework-docs](https://github.com/mohamedhabibwork/framework-docs)

## How the content works

The guides are written as plain Markdown in the repository's `docs/` directory
(one H1, relative `.md` links, `## Related` footer). This app renders them:

```text
docs/*.md                     canonical source (GitHub, MCP resources, site)
  └─ bun run sync ─────────►  src/content/docs/*.mdx   generated, never edited
```

`sync` adds frontmatter, drops the H1 (Starlight renders the title), rewrites
`.md` links to site routes, splices the generated package table and runs the
result through `oxfmt`. `check` re-runs the same transform and fails on drift,
plus: missing frontmatter, duplicate H1, orphan pages, broken internal links, a
package missing from the catalog and an untranslated `/ar/` route.

## Project structure

```text
├── public/fonts/          # Self-hosted variable fonts (Fraunces, Plex Sans, JetBrains Mono)
├── scripts/
│   ├── docs-lib.ts        # Shared transform + page manifest (PAGES)
│   ├── sync-docs.ts       # docs/*.md → src/content/docs/*.mdx
│   ├── check-docs.ts      # integrity gate
│   ├── snapshot-version.mjs
│   └── ensure-satteri-wasm.mjs
├── src/
│   ├── components/        # SiteTitle override, landing hero/features/pills
│   ├── content/docs/      # generated pages + index, releases, versions, ar/, v01/
│   ├── data/              # sidebar, versions, packages, i18n
│   └── styles/            # tokens → base → prose → landing
├── astro.config.mjs       # Starlight config, head meta, inline enhancements
├── Dockerfile             # Bun build → nginx serve
└── nginx.conf             # static hosting, cache headers, security headers
```

## Commands

| Command           | Action                                                          |
| :---------------- | :-------------------------------------------------------------- |
| `bun install`     | Install dependencies and link the vendored Satteri WASM binding |
| `bun run sync`    | Regenerate `src/content/docs/*.mdx` from `docs/*.md`            |
| `bun run check`   | Verify generated pages, frontmatter, links, sidebar and i18n    |
| `bun run dev`     | Start the Starlight dev server at `http://localhost:4321`       |
| `bun run build`   | Build the static site to `./dist/` (needs Node ≥ 22.23.4)       |
| `bun run preview` | Preview the production build locally                            |

## Design

Dark-first "Ember & Ink" theme: warm paper in light mode, ink and ember in dark
mode, editorial serif headings (Fraunces) over a technical body face (Plex Sans)
and a mono for code (JetBrains Mono). All colour goes through tokens in
`src/styles/tokens.css`; both themes are contrast-checked. Motion is gated on
`prefers-reduced-motion`, tables scroll in labelled focus regions, and print
styles drop the chrome.
