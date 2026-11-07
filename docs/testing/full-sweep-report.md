# Full sweep + fix — report

Task: "fix all broken functionality across the project". Scope agreed with the user: **full sweep + fix**.
Repo: `hono_template_app` (Bun workspace: `packages/*`, `apps/*`).
Branch state: worked **in place** on a dirty tree — nothing committed, reverted or stashed.

Author: Kou (software-engineer). Date: 2026-10-14.

---

## 1. Commands run (exact)

| #   | Command                                     | Purpose                                                                                      |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | `bun run db:up`                             | Start Postgres (`127.0.0.1:54329`) + Redis (`127.0.0.1:63799`) via `deployment/compose.yaml` |
| 2   | `bun run lint`                              | `biome check .`                                                                              |
| 3   | `bun run typecheck`                         | `tsc -p tsconfig.json`                                                                       |
| 4   | `bun run test`                              | `bun test ./packages ./apps`                                                                 |
| 5   | `bun run coverage`                          | `bun scripts/coverage.ts` (suite + per-package gate)                                         |
| 6   | `(cd apps/demo-api && bun run typecheck)`   | live app self-typecheck                                                                      |
| 7   | `bunx tsc -p apps/playground/tsconfig.json` | live app self-typecheck (playground has no `typecheck` script)                               |

Test env: `.env.test` was already present and correct
(`TEST_DATABASE_URL=postgres://framework:framework@127.0.0.1:54329/framework`, `REDIS_URL=redis://127.0.0.1:63799`).
`bun test` loads it automatically; the endpoint suites create and drop their own `fw_test_*` databases
(`packages/testing/src/test-database.ts`), never the app database.

Infrastructure: `bun run db:up` brought both containers up healthy. Postgres and Redis were **down** at the
start of the task; no test was pointed at a production/app database.

---

## 2. Before / after per gate

| Gate                        | Before                                                  | After                                                         |
| --------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| `bun run lint`              | **FAIL** (exit 1) — "Found a nested root configuration" | **PASS** (exit 0) — `Checked 399 files`, 0 diagnostics        |
| `bun run typecheck`         | PASS (exit 0)                                           | **PASS** (exit 0)                                             |
| `bun run test`              | **FAIL** (exit 1) — 431 pass / 1 fail / 2 errors        | **PASS** (exit 0) — 434 pass / 0 fail                         |
| `bun run coverage`          | **FAIL** — suite failed before the gate                 | **PASS** (exit 0) — 434 pass / 0 fail, "coverage gate passed" |
| `apps/demo-api` typecheck   | (not previously verified)                               | **PASS** (exit 0)                                             |
| `apps/playground` typecheck | (not previously verified)                               | **PASS** (exit 0)                                             |

Final status: **lint ✅ / typecheck ✅ / test ✅ / coverage ✅ (all green).**

---

## 3. Failures found, root cause, fix

### F1 — `bun run lint` aborted: nested root Biome config

- **Symptom:** `biome check .` exits 1 with _"Found a nested root configuration, but there's already a root
  configuration"_ pointing at `apps/demo-api/biome.json`. Lint produced **no** diagnostics at all.
- **Root cause:** `apps/demo-api/biome.json` is a second Biome **root** config inside the repo that already has
  a root `biome.json`. Biome refuses to run.
- **Fix:** mark the nested config non-root — added `"root": false` to `apps/demo-api/biome.json`.
  This is Biome's supported monorepo mechanism and, critically, keeps `apps/demo-api` **linted** (the app is
  live and first-class). Chose this over adding `apps/demo-api` to the root `files.includes` ignore list, which
  would have silently stopped linting the app.
- **Evidence:** before the fix `biome check .` checked 0 files; after, `Checked 399 files`.

### F2 — 24 lint diagnostics in `apps/demo-api` (revealed once F1 was fixed)

- **Symptom:** 12 `assist/source/organizeImports`, 9 `format`, 2 `lint/correctness/noUnusedImports`,
  1 `lint/correctness/noUnusedFunctionParameters` — all under `apps/demo-api`.
- **Root cause:** the app was authored/scaffolded without ever running the formatter/linter (the nested-config
  error had hidden it from the repo-wide check the whole time).
- **Fix:**
  - Applied Biome's **safe** fixes to the app (`biome check --write apps/demo-api`) — import sorting +
    formatting only; no logic touched.
  - Three manual fixes for the remaining warnings (all genuine dead code):
    - `apps/demo-api/bootstrap/http.ts`: dropped unused `AuditReader` import; renamed the unused `c`
      parameter of the `/audit` `authorize` guard to `_c` (Biome's canonical fix; keeps the explicit
      `Context<FrameworkEnv>` annotation).
    - `apps/demo-api/app/modules/products/services/product.service.ts`: removed unused
      `ProductRepository` type import.
- **Evidence:** lint now reports `Found 3 warnings` → after the manual fixes, `Checked 399 files` with
  **0 diagnostics**, exit 0.

### F3 — `bun run test`: `apps/demo-api/tests/health.api.test.ts` unhandled `ConfigError` (2 errors)

- **Symptom:** the whole file errored before any test ran:
  `ConfigError: Invalid configuration: - database.url: Invalid input: expected string, received undefined`.
- **Root cause (diagnosed, not guessed):** `apps/demo-api/routes/data.ts` called `loadAppConfig()` at **module
  scope**. `loadAppConfig()` reads `.env` relative to the process CWD. When the suite runs from the repo root
  (`bun test ./packages ./apps`) there is no `.env` there, and the test process env has no `DATABASE_URL`, so
  the returned promise rejected — an **unhandled rejection** ("Unhandled error between tests"). The app's own
  architecture passes validated config explicitly into `createApplication(config)`; a route re-loading config
  from disk both bypassed that and created a second, divergent config source.
- **Fix:** `apps/demo-api/routes/data.ts` now reads the booted application's validated config through the
  framework's `config()` helper (`@framework/support`, which reads the config the `Application` constructor
  registered) instead of loading `.env` from disk:
  ```ts
  authorize: () => {
    if (config('app.env') === 'production') throw forbidden('Import/export endpoints require authorization');
  },
  ```
  Behaviour is identical (deny import/export in production) but is CWD-independent and cannot diverge from the
  app's config. Verified: the file passes in isolation (`1 pass / 0 fail`).
- **Not a test problem:** the test is a valid smoke test; the product code was wrong.

### F4 — `bun run test`: `packages/cli/tests/create-app.test.ts` → `create --with-demo` failed

- **Symptom:** `(fail) create --with-demo (one-command full generation) > (unnamed) [5001.43ms]
  ^ a beforeEach/afterEach hook timed out`, then an unhandled error:
  `expect(created.stderr).not.toContain('error')` received
  `error: script "cli" was terminated by signal SIGTERM`.
- **Root cause:** the `create --with-demo` `beforeAll` runs `create` (which installs + generates the demo
  module + verifies it) but had **no timeout argument**, so it used Bun's 5 s default. Every `test()` in the
  file passes `TIMEOUT = 300_000`; the hook did not. The CLI command itself is fine — timed manually it
  completes in ~4.8 s and exits 0, i.e. it sits right on the 5 s line.
- **Fix:** passed `TIMEOUT` to the `--with-demo` `beforeAll` (and to the sibling `create` `beforeAll` that also
  does `create` + `bun install`). No assertion changed, no test skipped.

### F5 — `bun run coverage`: queue test flake — torn `status()` snapshot

- **Symptom:** under coverage instrumentation, `packages/queue/tests/queue.test.ts` intermittently failed, e.g.
  - `jobs exceeding their timeout fail` got `{ state: 'failed', failedReason: null, attempts: 0, finishedAt: null }`;
  - `transient failures are retried until success` got `{ state: 'completed', result: null, attempts: 2, failedReason: 'transient failure 2' }`.
- **Root cause (instrumented and proven):** `QueueKitAdapter.status()` reads the job **hash** (`queue.getJob`,
  an `HGETALL`) and its **state** (`job.getState()`, a separate list-membership query) in two round trips, and
  the original `toStatus()` performed **yet another** `getState()`. A poll landing on a state transition could
  therefore pair a _terminal_ state (read later) with the _pre-transition_ hash (read earlier) — a torn
  snapshot. A diagnostic harness reproduced the exact sequence:
  `getJob#1 atm=0 → getState#1=failed → getJob#2 atm=1`, and showed that the torn result came from the branch
  in `status()` seeing a **non-terminal** state (`active`) and then `toStatus()` re-reading the state and
  getting `failed` against the stale hash. BullMQ's `moveToFinished` Lua updates the hash and the zset
  atomically, so reading the hash _after_ observing a terminal state is always consistent.
- **Fix (`packages/queue/src/queuekit-adapter.ts`):** branch on the state **once**, pass that exact state into
  `toStatus`, and re-read the hash when the observed state is terminal:
  ```ts
  async status(id) {
    const job = await this.queue.getJob(id);
    if (!job) return null;
    const state = await job.getState();
    if (state === 'completed' || state === 'failed') {
      return toStatus((await this.queue.getJob(id)) ?? job, state);
    }
    return toStatus(job, state);
  }
  ```
  `toStatus(job, state)` no longer re-reads the state, so the reported `state` and the reported fields can
  never disagree. `failed()` passes the known `'failed'` state (jobs returned by `getFailed` are in the failed
  set) and drops a redundant per-job round trip.
- **Not a test problem:** the product's status endpoint really could return an internally inconsistent
  snapshot; the test simply surfaced it. No assertion was changed.
- **Verification:** a harness polling the timeout job showed **0/20** torn snapshots after the fix (vs. torn
  hits before); `bun test --coverage packages/queue/tests/queue.test.ts` ran **30/30** clean.

### F6 — `bun run coverage`: CLI test hooks timing out (systemic)

- **Symptom:** coverage run reported `(fail) (unnamed) [5001.80ms] ^ a beforeEach/afterEach hook timed out`,
  and `packages/cli/tests/generators.test.ts` threw `expect(await copy.exited).toBe(0)` → received `143`
  (128 + SIGTERM), i.e. the hook's `cp -R` child was killed by the 5 s default.
- **Root cause:** the CLI integration test files spawn heavy subprocess work in **file-level `beforeAll`/
  `afterAll`** hooks (copying the starter app with `cp -R`, `bun install`, generating apps) but did not pass a
  timeout, while their `test()` bodies do (300 s). Under coverage instrumentation (and with the CLI files
  running alongside each other) those hooks exceed the 5 s default and are killed.
- **Fix:** passed the file's own existing timeout budget to the heavy hooks:
  - `generators.test.ts` `beforeAll` → `300_000`
  - `generated-app.test.ts` `beforeAll` → `GENERATOR_TIMEOUT_MS`
  - `lifecycle.test.ts` `beforeAll` → `300_000`
  - `auth-app.test.ts` `beforeAll` + `afterAll` → `TIMEOUT`
  - `create-app.test.ts` file-level `afterAll` (runs `bun install`) → `TIMEOUT`
  - (`create-app.test.ts` describe `beforeAll`s → `TIMEOUT`, part of F4)
- **Not a weakening:** the hooks still must complete; they are only allowed the same budget their own tests
  already use. No assertion changed, no test skipped. (`cli.test.ts` hooks only do `mkdtemp`/`rm` — left alone.)

---

## 4. Files changed and why

Tracked files:

| File                                       | Change                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `packages/queue/src/queuekit-adapter.ts`   | F5: consistent `status()` snapshot; `toStatus(job, state)` signature; `failed()` uses the known state. |
| `packages/cli/tests/create-app.test.ts`    | F4/F6: `TIMEOUT` on the two describe `beforeAll`s and the file-level `afterAll`.                       |
| `packages/cli/tests/generators.test.ts`    | F6: `300_000` on the file-level `beforeAll`.                                                           |
| `packages/cli/tests/generated-app.test.ts` | F6: `GENERATOR_TIMEOUT_MS` on the file-level `beforeAll`.                                              |
| `packages/cli/tests/lifecycle.test.ts`     | F6: `300_000` on the file-level `beforeAll`.                                                           |
| `packages/cli/tests/auth-app.test.ts`      | F6: `TIMEOUT` on the file-level `beforeAll` and `afterAll`.                                            |

Untracked app `apps/demo-api` (first-class, treated as live):

| File                                                             | Change                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/demo-api/biome.json`                                       | F1: added `"root": false`.                                         |
| `apps/demo-api/bootstrap/http.ts`                                | F2: removed unused `AuditReader` import; `c` → `_c`.               |
| `apps/demo-api/app/modules/products/services/product.service.ts` | F2: removed unused `ProductRepository` import.                     |
| `apps/demo-api/routes/data.ts`                                   | F3: `config('app.env')` instead of module-scope `loadAppConfig()`. |
| ~18 other `apps/demo-api` files                                  | F2: Biome **safe** fixes only — import order + formatting.         |

`bun.lock` was regenerated with `bun install` to drop scratch `apps/created-demo` workspace entries that a
manual diagnostic run had added (0 `created-demo` references remain in the diff). No other lockfile change was
introduced by me.

---

## 5. What I could NOT fix

Nothing was left unfixed. Notes / residual risk:

- **Timing-sensitivity.** F4/F5/F6 are all timing-related; I verified them by repetition, not just a single
  green run: the queue test passed **30/30** under coverage instrumentation, and both `bun run test` (585 s) and
  `bun run coverage` (280 s) completed with **434 pass / 0 fail**. The fixes are logical (consistent snapshot,
  correct budget) rather than tuned sleeps.
- **Two coverage thresholds sit close to their measured baselines** (e.g. `packages/ai-mcp` functions 62.8% vs
  a 59% floor; `apps/playground` functions 68.7% vs 66%). They pass today; they are not something I changed —
  noted only so the next sweep knows they are near the line. No threshold was lowered.
- **`apps/playground` has no `typecheck` script**, so I ran `tsc -p apps/playground/tsconfig.json` directly.
  Consider adding a `typecheck` script for parity with `apps/demo-api`.

---

## 6. Final status

```
bun run lint       → exit 0   (Checked 399 files, 0 diagnostics)
bun run typecheck  → exit 0
bun run test       → exit 0   (434 pass, 0 fail, 0 errors; 40 files)
bun run coverage   → exit 0   (434 pass, 0 fail; "coverage gate passed")
apps/demo-api typecheck  → exit 0
apps/playground typecheck → exit 0
```

No test was deleted, skipped, or weakened; no coverage threshold was lowered. Two product bugs (a
module-scope config load that broke the demo-api suite, and a torn-read in the queue status surface) were
fixed at the source.
