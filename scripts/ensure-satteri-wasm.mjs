// MDX 8's markdown engine ("satteri") needs a runtime binding: native on
// Node, WebAssembly in browsers and in Astro 7's workerd-based dev isolation.
// The wasm32 variant is an optional dependency bun never materializes
// (CPU-filtered), which breaks `astro dev` with "Cannot find native binding".
//
// This script (wired as postinstall) extracts the vendored wasm32 tarball
// into bun's package store so satteri's browser entry works as designed. It
// also un-does any older patch of satteri's browser.js. Idempotent.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const WASM_IMPORT = "export * from '@bruits/satteri-wasm32-wasi'";

function findStore(start) {
  let dir = start;
  for (let step = 0; step < 8; step++) {
    const store = join(dir, 'node_modules/.bun');
    if (existsSync(store)) return store;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

const store = findStore(process.cwd());
if (!store) throw new Error('node_modules/.bun not found; run `bun install` first');
const pkgDir = readdirSync(store).find((name) => name.startsWith('satteri@'));
if (!pkgDir) throw new Error('satteri is not installed; run `bun install` first');

const satteriPkg = JSON.parse(readFileSync(join(store, pkgDir, 'node_modules/satteri/package.json'), 'utf8'));
const wasmName = '@bruits/satteri-wasm32-wasi';
const wasmVersion = satteriPkg.optionalDependencies?.[wasmName];
if (!wasmVersion) throw new Error(`satteri declares no optional ${wasmName}`);

// 1. Restore satteri's browser entry (older versions of this script patched it).
const browserEntry = join(store, pkgDir, 'node_modules/satteri/browser.js');
const original = readFileSync(browserEntry, 'utf8');
if (original.includes(WASM_IMPORT) === false) {
  writeFileSync(browserEntry, `${WASM_IMPORT}\n`);
  console.log(`[satteri-wasm] restored ${browserEntry}`);
}

// 2. Extract the vendored tarball into the store (bun skips wasm32 optional deps).
const wasmStoreDir = join(store, `${wasmName.replace('/', '+')}@${wasmVersion}`, 'node_modules', wasmName);
const vendorTarball = join(import.meta.dirname, '..', 'vendor', `bruits-satteri-wasm32-wasi-${wasmVersion}.tgz`);
if (!existsSync(vendorTarball)) {
  throw new Error(`Vendored tarball missing: ${vendorTarball} (see apps/docs/vendor/README.md)`);
}
if (!existsSync(join(wasmStoreDir, 'satteri_napi.wasm32-wasi.wasm'))) {
  rmSync(wasmStoreDir, { recursive: true, force: true });
  mkdirSync(wasmStoreDir, { recursive: true });
  const result = Bun.spawnSync(['tar', '-xzf', vendorTarball, '-C', wasmStoreDir, '--strip-components', '1']);
  if (result.exitCode !== 0) throw new Error(`tar failed: ${result.stderr.toString()}`);
  console.log(`[satteri-wasm] installed ${wasmName}@${wasmVersion} into the package store`);
}

// 3. Link it where the app's own node_modules would expect it (for direct imports).
const appLink = join(import.meta.dirname, '..', 'node_modules', '@bruits', 'satteri-wasm32-wasi');
if (!existsSync(join(appLink, 'satteri_napi.wasm32-wasi.wasm'))) {
  rmSync(appLink, { recursive: true, force: true });
  mkdirSync(dirname(appLink), { recursive: true });
  const copy = Bun.spawnSync(['cp', '-R', wasmStoreDir, appLink]);
  if (copy.exitCode !== 0) throw new Error(`link failed: ${copy.stderr.toString()}`);
  console.log(`[satteri-wasm] linked into app node_modules`);
}
