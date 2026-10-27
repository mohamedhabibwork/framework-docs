// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import starlight from '@astrojs/starlight';
import { docsVersions, formatLine } from './src/data/versions';
import { sidebarFor } from './src/data/sidebar';

// MDX 8's markdown engine ("satteri") needs a runtime binding: native on
// Node, WebAssembly in browsers. Bun skips satteri's wasm32 optional
// dependency during install, so `scripts/ensure-satteri-wasm.mjs`
// (postinstall) extracts the vendored tarball from vendor/ into the package
// store. No vite overrides needed.

// https://astro.build/config
export default defineConfig({
  site: 'https://framework.habib.cloud',
  // Fully static: dist/ is served by nginx in the Dokploy image (apps/docs/Dockerfile).
  output: 'static',
  integrations: [
    // starlight first: it registers astro-expressive-code, which must come
    // before mdx() so MDX pages get syntax-highlighted code blocks.
    starlight({
      title: 'Framework',
      description: 'Laravel-inspired TypeScript framework on Bun + Hono + Drizzle + Zod',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/mohamedhabibwork/framework' }],
      editLink: {
        baseUrl: 'https://github.com/mohamedhabibwork/framework-docs/edit/main/',
      },
      // Versioned docs: the current release is shown in the header version
      // pill and listed on /versions; older versions archive to their own
      // locale when a breaking pre-1.0 minor ships (Laravel-style docs
      // versioning). The archive is written by scripts/snapshot-version.mjs,
      // which is only ever run from the root release script.
      locales: {
        root: { label: `English (${formatLine(docsVersions.latest)})`, lang: 'en' },
        ar: { label: 'العربية', lang: 'ar', dir: 'rtl' },
        v01: { label: 'v0.1', lang: 'en' },
      },
      sidebar: sidebarFor(docsVersions.latest),
      components: {
        // Renders the site title plus a "v0.1" pill linking to /versions/.
        SiteTitle: './src/components/VersionPicker.astro',
      },
    }),
    mdx(),
  ],
});
