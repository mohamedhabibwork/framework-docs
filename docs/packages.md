# Packages

The framework is 25 packages, one per concern. Each is published as its own
repository (subtree-split from this monorepo), so an application can depend on
exactly the pieces it uses — and the framework can be adopted incrementally.

Inside the monorepo they resolve through the workspace:

```json
{ "dependencies": { "@framework/core": "workspace:*" } }
```

In a standalone application, the generated `package.json` points at the split
repositories:

```json
{ "dependencies": { "@framework/core": "github:mohamedhabibwork/framework-core" } }
```

<!-- packages:start -->
<!-- packages:end -->

## Status legend

| Status          | Meaning                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| **Validated**   | Covered by automated tests that run in `bun run test`                    |
| **Implemented** | Works and is exercised, but has no dedicated suite                       |
| **Contracts**   | Published types and DI tokens only — no runtime yet; do not depend on it |

The same classification, with the evidence for each row, is in
[Implementation status](status.md). A dash in the **Guide** column means the
package has no dedicated page yet — its README is the only reference.

## Dependencies between packages

```text
core ─┬─ support ── (helpers used everywhere)
      ├─ http ── validation ── crud ── cli
      ├─ database ─┬─ auth ── oauth-server
      │            └─ search
      ├─ events ── queue ── scheduler ── workflow
      └─ logging / cache / storage / mail / notifications
```

- `core` has no framework dependencies; it owns the container, config and
  lifecycle.
- `cli` depends on the packages it generates code _for_ only to render
  templates — generated applications refuse to scaffold an artifact whose
  package they do not depend on.
- `ai-mcp` bridges the CLI in-process; it is a tool, not a runtime dependency.

## Adding or removing a package

Packages are discovered from `packages/*` by the workspace globs. To add one:

1. `packages/<name>/package.json` with `"name": "@framework/<name>"`, `type: module`,
   `exports: { ".": "./src/index.ts" }`.
2. `src/index.ts` re-exporting the public API, `src/types.ts` for interfaces,
   `src/constants.ts` for DI tokens, `src/provider.ts` for `create<Name>Provider`.
3. `tests/` with a suite that runs against real infrastructure where relevant.
4. A row in this catalog and in [Implementation status](status.md), plus a guide
   page when the package has a user-facing surface.

Removing a package means deleting its directory, its row here, and its
`.gitmodules` entry — the sync script (`bun run sync:repos`) derives repositories
from that file.

## Related

- [Implementation status](status.md) — delivery evidence per package and command
- [CLI reference](cli-reference.md) — generators that scaffold against packages
- [Deployment](deployment.md) — how split repositories are released
