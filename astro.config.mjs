// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import starlight from '@astrojs/starlight';
import { docsVersions } from './src/data/versions';
import { sidebarFor } from './src/data/sidebar';
import { translatedArRoutes } from './src/data/i18n';

// MDX 8's markdown engine ("satteri") needs a runtime binding: native on
// Node, WebAssembly in browsers. Bun skips satteri's wasm32 optional
// dependency during install, so `scripts/ensure-satteri-wasm.mjs`
// (postinstall) extracts the vendored tarball from vendor/ into the package
// store. No vite overrides needed.

/**
 * Pages under the Arabic locale that have no translation render from the
 * English source while `<html dir="rtl">` still applies, mirroring English
 * text. Only pages listed in `translatedArRoutes` keep RTL; every other `/ar/`
 * page is flipped back to LTR before first paint (no flash, no reflow).
 */
const rtlFallbackFix = `(() => {
  const translated = ${JSON.stringify(translatedArRoutes)};
  if (document.documentElement.lang !== 'ar') return;
  const path = location.pathname.endsWith('/') ? location.pathname : location.pathname + '/';
  if (!translated.includes(path)) document.documentElement.dir = 'ltr';
})();`;

/**
 * Progressive enhancement for content that Markdown cannot express:
 *
 * - Wraps wide tables in a focusable scroll region (role="region", labelled by
 *   the header row) so keyboard users can scroll them. The wrapper adds no
 *   visual box, so there is no layout shift.
 * - Marks external links with rel="noopener noreferrer".
 *
 * Runs on DOMContentLoaded and is idempotent.
 */
const contentEnhancements = `document.addEventListener('DOMContentLoaded', () => {
  for (const table of document.querySelectorAll('.sl-markdown-content table')) {
    if (table.parentElement && table.parentElement.classList.contains('table-wrap')) continue;
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    const firstHeader = table.querySelector('thead th');
    const label = firstHeader && firstHeader.textContent ? firstHeader.textContent.trim() : '';
    wrap.setAttribute('aria-label', label ? 'Table: ' + label : 'Data table');
    table.replaceWith(wrap);
    wrap.appendChild(table);
  }
  for (const link of document.querySelectorAll('.sl-markdown-content a[href^="http"]')) {
    if (link.hostname === location.hostname) continue;
    link.rel = 'noopener noreferrer';
    link.dataset.external = 'true';
  }
});`;

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
      // Design system, loaded in cascade order: primitives → chrome → prose →
      // the splash page.
      customCss: [
        './src/styles/tokens.css',
        './src/styles/base.css',
        './src/styles/prose.css',
        './src/styles/landing.css',
      ],
      lastUpdated: true,
      pagination: true,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      head: [
        {
          tag: 'link',
          attrs: {
            rel: 'preload',
            href: '/fonts/fraunces.woff2',
            as: 'font',
            type: 'font/woff2',
            crossorigin: 'anonymous',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'preload',
            href: '/fonts/plex.woff2',
            as: 'font',
            type: 'font/woff2',
            crossorigin: 'anonymous',
          },
        },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#0b0d10', media: '(prefers-color-scheme: dark)' } },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#faf7f1', media: '(prefers-color-scheme: light)' } },
        { tag: 'meta', attrs: { property: 'og:site_name', content: 'Framework' } },
        { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary' } },
        { tag: 'script', content: rtlFallbackFix },
        { tag: 'script', content: contentEnhancements },
      ],
      // Versioned docs: the current release is shown in the header version
      // pill and listed on /versions; older versions archive to their own
      // locale when a breaking pre-1.0 minor ships (Laravel-style docs
      // versioning). The archive is written by scripts/snapshot-version.mjs,
      // which is only ever run from the root release script.
      locales: {
        // The version lives in the header pill; repeating it here only made the
        // language select overflow on narrow headers.
        root: { label: 'English', lang: 'en' },
        ar: { label: 'العربية', lang: 'ar', dir: 'rtl' },
        v01: { label: 'v0.1', lang: 'en' },
      },
      sidebar: sidebarFor(docsVersions.latest),
      components: {
        // Renders the site title plus a version pill linking to /versions/.
        SiteTitle: './src/components/VersionPicker.astro',
      },
    }),
    mdx(),
  ],
});
