# Testing

What is tested, how endpoint tests run against real infrastructure, and the
helpers the framework provides.

## Requirements

```sh
bun run db:up                       # PostgreSQL :54329 + Redis :63799 (compose)
cp .env.test.example .env.test      # TEST_DATABASE_URL=postgres://… (a server-level admin URL)
```

`TEST_DATABASE_URL` must point at a **dedicated test server/admin URL** —
never the application's `DATABASE_URL`; the testing package refuses to
create test databases on the application target or in `APP_ENV=production`.

## Isolated databases

Every database test gets its own database (`fw_test_<random>`), created from
`TEST_DATABASE_URL`, migrated from the app's `database/migrations`, and
**dropped in success and failure paths**. Nothing leaks between runs.

Application-level tests use the generated `tests/support.ts`:

```ts
const ctx = await createTestContext(); // boots the full app on a fresh migrated DB
const response = await ctx.client.request('/api/v1/products', jsonInit('POST', { name: 'x', price: '1' }));
await ctx.close(); // stops server, shuts down, drops the DB
```

`TEST_MODE=network` swaps in-process `http.request` for a real loopback
listener (same assertions, real transport). The generated endpoint suites
run identically in both modes — `make:crud --verify --test-mode network`
proves routes over the wire.

## What the generated suites cover

Each `make:crud` module ships `tests/<resource>.crud.api.test.ts`, which
calls the **registered Hono application** (never a mocked controller):

- happy path: create → list → read → update → re-read → delete → 404
- public allowlist exposure (secret fields never serialized)
- deterministic, bounded listing; pagination bounds (422)
- malformed JSON (400), malformed ids (422), unknown ids (404)
- invalid payloads: missing / mistyped / refinement-violating / forbidden fields
- empty updates, immutable fields (`createdAt`)

`make:crud --verify` runs this suite plus a typecheck after every generation
and reports each route, pass/fail counts and database cleanup in the result
(JSON with `--json`).

## Framework package tests

Package tests (`packages/*/tests`) exercise real adapters where it matters:
CRUD mixins, auditing, transactions and pagination run on real PostgreSQL;
queues run on real Redis; events tests cover both buses. Pattern:

```ts
const database = await createTestDatabase({ adminUrl: requireTestDatabaseUrl() });
const connection = createConnection({ url: database.url, maxConnections: 4 });
await connection.sql`create table …`;
// … assertions …
await connection.close();
await database.drop();
```

## Fakes — and their limits

`MemoryEventBus` stands in for Redis in unit tests; the testing package
provides isolated databases instead of a fake query layer. Fakes prove
wiring, never infrastructure behavior — retry, duplicate delivery and
failure semantics are only proven by the real-adapter suites.

## Generator and release gates

- `packages/cli/tests/generated-app.test.ts` — `make:crud` end to end on new
  and existing tables, route collisions, `--dry-run` writing nothing, and
  the generated application's full suite.
- `packages/cli/tests/create-app.test.ts` — the `create` release gate: the
  generated application typechecks, passes its suite, migrates the audit
  table, accepts `make:crud --verify`, and `create --with-demo` produces a
  working products module whose endpoint tests pass as-is.
- `apps/playground/tests/contract.test.ts` — OpenAPI drift check and a typed
  Hono RPC client against the composed application.

Run everything from the workspace root:

```sh
bun test          # or: bun run test
```

## Coverage

`bun run coverage` runs the whole workspace suite once with lcov coverage and
enforces per-package line/function thresholds (`scripts/coverage.ts`):

```sh
bun run coverage              # suite + gate (what CI runs)
bun run coverage -- --report  # suite + table, no thresholds
```

- Thresholds are measured baselines minus a small margin: they catch
  regressions, not aspirational targets. Raise them by improving a suite,
  then commit the new numbers with it.
- Test files are excluded and the template-literal generator files
  (`packages/cli/src/generators/*/templates*.ts`) are ignored via
  `bunfig.toml` — authored strings are not executed logic.
- Known limitation: Bun's coverage only reports files the run actually
  loaded, so a src file no test imports is invisible rather than 0%. The
  gate is a regression guard, not a whole-tree guarantee. (The CLI's own
  number is bounded the same way: its heaviest surfaces run in spawned
  scratch-copy processes that coverage cannot see.)

## Conventions

- No skipped-if-missing tests: missing `TEST_DATABASE_URL` fails with setup
  instructions instead of silently passing.
- Tests never auto-migrate the application database; they only migrate their
  own isolated database.
- Ephemeral network servers bind `127.0.0.1:0` and always close.
