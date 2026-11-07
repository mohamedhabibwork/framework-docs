# Vendored dependencies

- `bruits-satteri-wasm32-wasi-<version>.tgz` — the WebAssembly runtime variant
  of satteri (MDX 8's markdown engine). Bun skips wasm32 optional dependencies
  during install (CPU filter), which breaks `astro dev` (workerd cannot load
  native bindings). `scripts/ensure-satteri-wasm.mjs` (postinstall) extracts
  this tarball into the package store.

To upgrade satteri: `npm pack @bruits/satteri-wasm32-wasi@<new version>` and
replace the tarball here.
