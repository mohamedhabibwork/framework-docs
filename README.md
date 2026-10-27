# Framework Documentation (`mohamedhabibwork/framework-docs`)

Official documentation site and Markdown reference guides for [**mohamedhabibwork/framework**](https://github.com/mohamedhabibwork/framework) — a Laravel-inspired TypeScript framework built on Bun, Hono, Drizzle ORM, and Zod.

## Ecosystem Links

- **Live Documentation**: [https://framework.habib.cloud](https://framework.habib.cloud)
- **Main Framework Repository**: [mohamedhabibwork/framework](https://github.com/mohamedhabibwork/framework)
- **Starter Application Template**: [mohamedhabibwork/framework-app](https://github.com/mohamedhabibwork/framework-app)
- **Documentation Repository**: [mohamedhabibwork/framework-docs](https://github.com/mohamedhabibwork/framework-docs)

## Project Structure

```text
.
├── docs/                  # Plain Markdown guides (also consumed by @framework/ai-mcp)
├── public/                # Static assets
├── scripts/               # Satteri WASM postinstall & version snapshot scripts
├── src/
│   ├── components/        # Custom Starlight components (VersionPicker)
│   ├── content/docs/      # English (root), Arabic (ar/), and versioned (v01/) MDX pages
│   └── data/              # Sidebar and version definitions
├── vendor/                # Vendored @bruits/satteri-wasm32-wasi tarball for Bun
├── astro.config.mjs       # Astro + Starlight configuration
├── Dockerfile             # Multi-stage Bun -> nginx production container
├── nginx.conf             # Static site nginx configuration
└── package.json
```

## Commands

| Command           | Action                                                          |
| :---------------- | :-------------------------------------------------------------- |
| `bun install`     | Install dependencies and link the vendored Satteri WASM binding |
| `bun run dev`     | Start local Starlight dev server at `http://localhost:4321`     |
| `bun run build`   | Build static production site to `./dist/`                       |
| `bun run preview` | Preview the production build locally                            |
