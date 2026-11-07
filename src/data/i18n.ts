/**
 * Translation manifest.
 *
 * Starlight falls back to the default locale for any page a locale does not
 * provide, but it still applies the locale's `dir` to `<html>`. English text
 * inside an RTL document is mirrored, so the fallback pages must opt out — and
 * the only reliable moment to do that is before first paint.
 *
 * `translatedArRoutes` is therefore the list of Arabic pages that really are
 * Arabic; everything else under `/ar/` is an English fallback and is switched
 * back to LTR by the inline script in `astro.config.mjs`.
 *
 * `scripts/check-docs.ts` asserts this list matches `src/content/docs/ar/`, so
 * adding a translation without listing it fails the build.
 */
export const translatedArRoutes: readonly string[] = ['/ar/', '/ar/getting-started/'];
