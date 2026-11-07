# End-to-End Test Plan — Laravel v13 Parity Framework (ORM excluded)

**Author:** Edward (严过关), QA Engineer · **Team:** `software-laravel-framework` · **Language:** English
**Consumer:** `software-engineer` (Alex) + `software-architect` (Bob) · **Status:** Ready for execution
**Primary inputs:** `docs/architecture/laravel-parity-architecture.md` (the plan, T01–T22), `docs/requirements/laravel-parity-scope.md` (parity matrix, P0/P1/P2), `docs/status.md` (427-test baseline, per-package suites, real-infra gates), `docs/architecture/decisions.md` (ADR-2 `bun test`, ADR-9 migrations = release step, ADR-11 capability honesty), `docs/testing.md` (existing conventions), `packages/testing/src/*` and `packages/*/tests/*`.

> **Scope of this document.** This is the **test** half of the end-to-end plan. The build roadmap lives in the architecture plan (Part B, T01–T22); the documentation plan lives with the PM. Here we define _how every feature is proven_, _what counts as evidence_, and _what is merge-blocking_. **No production code is written here.**

> **Grounding.** All commands, paths, env vars and thresholds below are taken from the **real** repo, not invented: `bun run test` = `bun test ./packages ./apps`; `bun run coverage` = `scripts/coverage.ts`; test DBs are `fw_test_*` created/dropped by `packages/testing/src/test-database.ts`; network-mode CRUD uses `serveOnEphemeralPort` in `packages/testing/src/http.ts`; CI services are `postgres:17` + `redis:7` (`.github/workflows/ci.yml`).

---

## 1. Test Strategy & Pyramid

### 1.1 The one non-negotiable rule

> **Fakes are never evidence of real infrastructure behaviour (ADR-11).**
> A `MemoryEventBus`, `MemoryMailTransport`, `MemoryCache`, in-memory queue or a mocked `StorageDisk` may prove **wiring** (a provider bound the right token, a handler was called with the right shape). They may **never** be cited as proof that retries, duplicate delivery, TTL expiry, distributed locks, cross-instance pub/sub, S3 semantics or SMTP handshake behaviour work. Any subsystem whose value is in its _infrastructure_ semantics must be proven against that infrastructure (Postgres / Redis / MinIO / a real SMTP capture).

This rule is why the pyramid below is **wide at the base but has an explicit real-infrastructure band** — not a classic "mostly unit" pyramid. Coverage percentage is not the goal; _behavioural evidence per acceptance criterion_ is.

### 1.2 Levels, and what each level is _for_

| #   | Level                   | Purpose (what it proves)                                                                                                                                                                                                                        | Runner / location                                                                                           | Infra                               | Runs in CI              |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------- |
| L1  | **Unit**                | Pure logic is correct in isolation: resolvers, topo-sort, Zod→JSON schema, filter/sort DSL parsing, crypt round-trip, `Str`/`Arr`, gate closures. No I/O.                                                                                       | `bun test` — `packages/*/tests/*.test.ts`                                                                   | none                                | ✅ always               |
| L2  | **Integration**         | Two or more in-repo units cooperate: provider boot order, container resolution, container scoping, kit-adapter registration into `KitRegistry`, provider dispose. Real adapters where cheap.                                                    | `bun test`                                                                                                  | none / ephemeral                    | ✅ always               |
| L3  | **HTTP feature**        | A **registered Hono application** answers real requests correctly (status, body, headers, error envelope) — never a mocked controller. Covers happy/error/boundary.                                                                             | `bun test`; `hono.request` (in-process) or `serveOnEphemeralPort` (network)                                 | none (in-proc) or loopback          | ✅ always               |
| L4  | **Contract**            | Each subsystem's **public contract** is satisfiable by a _different_ implementation without touching consumers (§5).                                                                                                                            | `bun test` — `packages/*/tests/*.override.test.ts`                                                          | varies                              | ✅ always               |
| L5  | **Real-infrastructure** | The subsystem's _infrastructure semantics_ hold on the real engine: Postgres (transactions, constraints, advisory locks, JSONB, enums, composite keys), Redis (locks, pub/sub, BullMQ retries/inspection), MinIO/S3 (cloud disk), SMTP capture. | `bun test` with `TEST_DATABASE_URL` / `REDIS_URL` / `MINIO_*` set                                           | **Postgres / Redis / MinIO / SMTP** | ✅ always (services up) |
| L6  | **Generated-app**       | `create` + `make:crud` emit a **compiling, migrating, self-testing** app; the generated app's own suite passes.                                                                                                                                 | `packages/cli/tests/{create-app,generated-app,auth-app,generators,lifecycle}.test.ts` (spawns into `.tmp/`) | Postgres (+Redis for queue hooks)   | ✅ always               |
| L7  | **Feature-exclusion**   | The 6 mechanical invariants hold on the 3-feature fixture (§4). Proves _removal is real_, not a runtime `if`.                                                                                                                                   | `packages/cli/tests/features.test.ts` + `feature:check`                                                     | Postgres (boot/migrate)             | ✅ always               |
| L8  | **Regression**          | The **427-test baseline** + `coverage` + `typecheck` + `lint` stay green after every change; full-profile `create` output is byte-equivalent (A3).                                                                                              | `bun run test` / `coverage` / `typecheck` / `lint`                                                          | Postgres + Redis                    | ✅ always               |
| L9  | **End-to-end**          | A _generated, isolated_ app boots on its real entry point and serves a full user journey (register → auth → CRUD → queue → workflow → OpenAPI), including one over-the-wire pass.                                                               | `apps/playground` + generated app; `TEST_MODE=network`                                                      | Postgres + Redis (+MinIO)           | ✅ always               |

### 1.3 Level-selection rules (what to reach for)

1. **Pure function → L1.** If it has no `await`, no `process.env`, no DB, it is a unit test.
2. **Anything that touches Postgres/Redis/S3/SMTP → L5, full stop.** Do not "test it with a fake and move on" (the ADR-11 rule).
3. **Route behaviour → L3**, and the assertion must call the composed `Application`, not a controller method.
4. **"Is this subsystem replaceable?" → L4.** One override test per subsystem is the _measurable gate_ (P0-6, T18).
5. **"Did the generator produce something real?" → L6.** The generated app's _own_ suite is the evidence, not the generator's unit tests.
6. **"Is removal real?" → L7.** Only the import-walk + `--frozen-lockfile` prove it (§4).

### 1.4 Determinism & flakiness policy (applies to every level)

| Rule                                     | Detail                                                                                                                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No wall-clock sleeps for correctness** | Use injected fixed clocks (`nowIso`/`Date` injection) and bounded `retry()` polling with a hard timeout, never a bare `await sleep(500)` to "wait for the queue".                        |
| **Bounded retries, not fixed sleeps**    | Where eventual consistency is inherent (BullMQ, Redis pub/sub), poll with a deadline (e.g. `retry(..., { attempts: 40, delayMs: 50 })`) and **fail with the observed state** on timeout. |
| **Idempotent & independent**             | Every test creates its own `fw_test_*` DB / namespaced Redis keys / unique MinIO prefix; no test depends on another's leftovers or ordering.                                             |
| **Always clean up**                      | DBs dropped in **both** success and failure paths (already enforced by `createTestDatabase`); ephemeral servers `stop()`; Redis keys deleted.                                            |
| **Deterministic ordering**               | Listing/pagination tests assert on a stable sort key, never on insertion-order luck.                                                                                                     |
| **No skipped-if-missing**                | Missing `TEST_DATABASE_URL`/`REDIS_URL` **throws** with setup instructions (existing convention in `packages/queue/tests/queue.test.ts`), never a silent pass.                           |
| **Fixed TZ / locale**                    | Scheduler + localization tests pin `TZ` and locale so cron/DST and message-catalog tests are reproducible.                                                                               |

---

## 2. Per-Subsystem Test Matrix

Legend for **Test types**: `U`=unit, `I`=integration, `H`=HTTP feature, `C`=contract/override, `R`=real-infra, `G`=generated-app, `X`=feature-exclusion.
**Infra**: `—` none · `PG` Postgres · `RDS` Redis · `S3` MinIO/S3 · `SMTP` mail capture.
Subsystems in **bold** are net-new or have a net-new surface in this release.

### 2.1 Core, HTTP, validation

| Subsystem                                                 | Test types       | Key cases — happy / error / boundary                                                                                                                                                                                                                                                                                                                          | Fixtures                                       | Infra           | Acceptance evidence (command → expected)                                                  |
| --------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| `core` (container, providers, config, lifecycle, runtime) | U, I, C, R(Node) | happy: singleton/scoped/transient resolution, provider order, deferred provider, partial-boot cleanup, validated frozen config, graceful shutdown. error: **cycle detection**, **captive dependency** (scoped↔singleton), missing config key → named boot error, provider throws → rollback. boundary: scope disposal after request, overridden binding wins. | `ExecutionContext`, fake providers             | —               | `bun test packages/core` → all green; captive/cycle cases asserted by name                |
| **`core` Node runtime adapter (T20)**                     | U, I, R, G       | happy: `node-adapter` boots server/worker/serve via `@hono/node-server`. error: adapter missing peer → catalogued error. boundary: **parity** — same app passes the smoke suite on Bun **and** Node.                                                                                                                                                          | node template tree                             | — (Node binary) | `bun test packages/core` + CI node-matrix job → smoke suite green on both runtimes        |
| `http` (kernel, routing, middleware, errors, throttle)    | U, H, C          | happy: groups/named routes/params, alias+group middleware, `route:list`, security headers, CORS. error: duplicate-route detection, 404 envelope, `onError` envelope (no `try/catch` around `next()` — ADR-5), 429 + `Retry-After`. boundary: body limit, request-id propagation, mount-time authz guard ordering.                                             | composed `Application`, `serveOnEphemeralPort` | —               | `bun test packages/http` → green; 429 + `Retry-After` asserted                            |
| **`http` outbound client `Http::` (T13)**                 | U, C, R(fetch)   | happy: JSON helper, timeout, retry with backoff. error: 5xx retry-then-fail, network error surfaced. boundary: max retries, timeout boundary.                                                                                                                                                                                                                 | `fake.ts` transport + ephemeral loopback       | loopback        | `bun test packages/http` → green; retry count asserted via fake **and** one loopback test |
| **`http` localization (T12)**                             | U, H, C          | happy: `__()` resolves key, locale via header/route, catalog switch. error: missing key → fallback (not throw). boundary: locale precedence, nested params.                                                                                                                                                                                                   | message catalogs                               | —               | `bun test packages/http` → green                                                          |
| `validation` (validate, form requests)                    | U, H, C          | happy: valid payload passes, RPC types preserved. error: 422 field-path envelope, **403-before-422** ordering, async authz hook. boundary: unknown/extra fields, refinement failures.                                                                                                                                                                         | Zod schemas                                    | —               | `bun test packages/validation` → green                                                    |

### 2.2 Database, CRUD, auth

| Subsystem                                                                      | Test types | Key cases — happy / error / boundary                                                                                                                                                                                                                                                                                                                                                          | Fixtures                                         | Infra  | Acceptance evidence (command → expected)                                                    |
| ------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------- |
| `database` (connections, tx, mixins, audit, pagination, migrations, factories) | U, I, R, C | happy: AsyncLocalStorage tx + savepoints, createMany/updateMany/deleteMany/restoreMany (audited per row), bounded pagination, migration status. error: rollback on throw, 23505/23503 → 409 mapping, locked migration contention. boundary: pagination bounds, ISO timestamp normalization, soft-delete restore.                                                                              | `createTestDatabase`, migrations folder          | **PG** | `bun test packages/database` (with `TEST_DATABASE_URL`) → green on real Postgres            |
| **`database` composite-key + relation mixins (T07/T08)**                       | U, R       | happy: composite PK CRUD, FK-driven belongsTo/hasMany metadata, pgEnum→`z.enum`, jsonb schema. error: unknown relation rejected (not guessed). boundary: non-`id` key generation.                                                                                                                                                                                                             | migration with composite key + FK + enum + jsonb | **PG** | `bun test packages/database` + generated fixture → green                                    |
| `crud` (ResourceService/Controller, audit, import/export, DataPorter)          | U, H, R, C | happy: 5 endpoints create→list→read→update→delete→404; ownership scope (`ownedBy`) cross-owner read/write → **404**; CSV/JSON import/export partial-success. error: 400 malformed JSON, 422 malformed id, 404 unknown id, guard-before-validation. boundary: secret fields never serialized, immutable `createdAt`, empty update, pagination bounds.                                          | registered Hono app, `serveOnEphemeralPort`      | **PG** | `bun test packages/crud` → green; `make:crud --verify --test-mode network` → per-route pass |
| **`crud` programmatic `defineResource().crud()` (T06)**                        | U, H, R, C | happy: `.schema().access().ownedBy().relations().crud()` mounts the **same 5 native routes** as the CLI path. error: **missing `.access()` → refuses** (ADR-8, no silent public). boundary: route set identical to CLI-generated resource.                                                                                                                                                    | Drizzle table + Zod schemas                      | **PG** | `bun test packages/crud/tests/resource.test.ts` → green; route-set equality asserted        |
| **`crud` relations + transform + filter/sort (T07/T08/T09)**                   | U, H, R, C | happy: allowlisted `?include=` loads relations; transform projects row→public payload (date/decimal mapping); `?filter[price][gte]=10&sort=-created_at`. error: non-allowlisted include → 422, unknown operator → 422. boundary: nested include depth, sort on nullable column.                                                                                                               | FK fixtures                                      | **PG** | `bun test packages/crud` → green; OpenAPI documents `include`/filter/sort                   |
| `auth` (sessions, tokens, 2FA, JWT, policies, ownership)                       | U, H, R, C | happy: register/login/me/logout, token issue/revoke, email verify, password reset (no enumeration), TOTP two-step, JWT/JWK guard, ownership policies. error: wrong password, reused token, expired JWT, **401/403**. boundary: **TOTP SHA-256 only** (Google Authenticator cannot enroll — assert the documented limitation, don't "fix" it), JWKS `kid` rotation, session rotation on login. | users/sessions/tokens tables                     | **PG** | `bun test packages/auth` → green on real Postgres                                           |
| **`auth` Gate registry (T10)**                                                 | U, C       | happy: `Gate.define/before/after/allows/denies`. error: undefined ability → deny. boundary: `before` short-circuit wins over `define`; policies still work alongside.                                                                                                                                                                                                                         | —                                                | —      | `bun test packages/auth/tests/gate.test.ts` → green                                         |
| **`auth` passkey/WebAuthn (T22, P2)**                                          | U, H       | happy: additive guard registration. error: malformed challenge rejected. boundary: coexists with existing guards.                                                                                                                                                                                                                                                                             | —                                                | —      | `bun test packages/auth` → green                                                            |

### 2.3 Kit-backed subsystems (cache, queue, storage, mail, notifications, logging)

| Subsystem                                                | Test types | Key cases — happy / error / boundary                                                                                                                                                                                                                                                                                                                       | Fixtures                                   | Infra            | Acceptance evidence (command → expected)                                            |
| -------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------- |
| `cache` (Cache, LockStore, RateLimiter)                  | U, I, R, C | happy: get/set/has/remember/delete, TTL, atomic counters, distributed lock acquire/release, fixed-window rate limit. error: lock held → refuses, JSON pre-validation before write. boundary: **Redis tags/namespace-clear reported unsupported, never faked**; never flushes shared Redis.                                                                 | memory + Redis engine                      | **RDS**          | `bun test packages/cache` (with `REDIS_URL`) → green; capability matrix asserted    |
| **`cache` `Cache::touch` (T22, P1-8)**                   | U, R       | happy: extends TTL without re-fetch on memory **and** Redis. boundary: touch on missing key.                                                                                                                                                                                                                                                               |                                            | **RDS**          | `bun test packages/cache` → green                                                   |
| `queue` (QueueManager, JobWorker, batches, failed jobs)  | U, I, R, C | happy: dispatch/worker, retries + backoff, timeout, batches (HINCRBY/HSETNX finish), status/failed/retry/forget/prune/pause/resume, idempotency keys, per-job execution scope. error: payload validation before enqueue, timeout kill, catalogued refusal for unknown ids. boundary: retry semantics independent of scheduler precision (bounded retries). | BullMQ over Redis                          | **RDS**          | `bun test packages/queue` → green; `bun run cli -- queue:status` against real Redis |
| **`queue` inspection-gap closure (T17)**                 | U, I, R, C | happy: inspection port returns jobs; documented direct BullMQ path preserved. error: unsupported inspection op → catalogued `CAPABILITY_UNSUPPORTED` (never fake). boundary: inspection of empty/paused queue.                                                                                                                                             |                                            | **RDS**          | `bun test packages/queue/tests/inspection.test.ts` → green                          |
| `storage` (disks, visibility, signed URLs)               | U, I, R, C | happy: put/get/stream/delete/exists/size/list(bounded)/move/copy, private/public roots, temp prune. error: **14 path-traversal attempts rejected**, size/extension guard, private disk → no public URL. boundary: local `signedUrl` unsupported (honest).                                                                                                  | local disk fixture                         | —                | `bun test packages/storage` → green                                                 |
| **`storage` cloud disk MinIO/S3 (T16)**                  | I, R, C    | happy: put/get/delete/list against **real MinIO** in compose. error: cloud driver without peer SDK → `STORAGE_DRIVER_UNAVAILABLE` at boot. boundary: signed URL against MinIO.                                                                                                                                                                             | MinIO service in compose                   | **S3 (MinIO)**   | `bun test packages/storage/tests/cloud.test.ts` (with MinIO up) → green             |
| `mail` (Mailer, transports, fakes)                       | U, I, C    | happy: builder applies default from, recipients normalized, text-or-html refine. error: `ConsoleMailTransport` redacts bodies to byte counts; `MemoryMailTransport` one-shot failure injection. boundary: invalid message → Zod error.                                                                                                                     |                                            | —                | `bun test packages/mail` → green                                                    |
| **`mail` SMTP transport (T14, P0-5)**                    | I, R, C    | happy: **real SMTP** send replaces `SMTP_PLANNED`, queued-by-default. error: transport failure → retry via queue. boundary: missing `nodemailer` peer → catalogued error.                                                                                                                                                                                  | local SMTP capture (e.g. MailHog/smtp4dev) | **SMTP**         | `bun test packages/mail/tests/smtp.test.ts` → green; message observed in capture    |
| `notifications` (email/database/push/messaging channels) | U, I, R, C | happy: inline fan-out with per-channel status, `sendQueued` idempotent (delivered channels never re-sent on resume), database ledger. error: failure isolation (one channel fails, others proceed). boundary: versioned job replay.                                                                                                                        |                                            | **PG/RDS**       | `bun test packages/notifications` → green                                           |
| **`notifications` SMS channel (T15, P0-4)**              | I, R, C    | happy: SMS over NotifyKit with per-channel config. error: unsupported op → catalogued error. boundary: failure isolation from email channel.                                                                                                                                                                                                               | NotifyKit config                           | provider sandbox | `bun test packages/notifications/tests/sms.test.ts` → green                         |
| `logging` (LoggerKit sinks, redaction, correlation)      | U, I, R, C | happy: console/file/memory sinks, ambient correlation id + actor enrichment, `child()` inheritance. error: fields redacted through core's `redact`. boundary: flush/close on dispose.                                                                                                                                                                      |                                            | —                | `bun test packages/logging` → green                                                 |

### 2.4 Cross-cutting subsystems

| Subsystem                                                                | Test types    | Key cases — happy / error / boundary                                                                                                                                                                                                                                                                                                        | Fixtures                                                                                                                                                                   | Infra           | Acceptance evidence (command → expected)                                |
| ------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------- |
| `events` (EventBus, Redis pub/sub, RealtimeHub)                          | U, I, R, C    | happy: in-memory + Redis pub/sub, WebSocket channel allowlist, per-connection authz, subscription limits. error: unauthorized channel → rejected. boundary: namespaced payloads validated; dedicated subscriber connection.                                                                                                                 |                                                                                                                                                                            | **RDS**         | `bun test packages/events` → green; cross-instance delivery asserted    |
| `scheduler` (cron, TZ, overlap, distributed lock)                        | U, I, R, C    | happy: cron + timezone fires, `skip`/`replace` overlap, Redis overlap lock, `schedule:{name}:{fireId}` idempotency. error: duplicate fire suppressed. boundary: DST transition, `schedule:test` end-to-end.                                                                                                                                 | pinned `TZ`                                                                                                                                                                | **RDS**         | `bun test packages/scheduler` → green; `bun run cli -- schedule:test`   |
| `workflow` (saga engine)                                                 | U, I, R, C    | happy: workflow→pipeline→stage→action, parallel groups, `via:'inline'                                                                                                                                                                                                                                                                       | 'queue'`, wait-for-event, progress events. error: per-action retry/timeout, **reverse-order compensation**, cancel/retry/resume. boundary: conditional transitions, prune. | workflow tables | **PG + RDS**                                                            | `bun test packages/workflow` → green; `workflow:status` against real Postgres |
| `openapi` (3.1 generation, drift)                                        | U, I, C       | happy: operations from metadata + Zod, per-status `ErrorEnvelope`, 422 `fields` schema. error: **route/operation drift check fails on mismatch**. boundary: catalogued code enums exact.                                                                                                                                                    | operation metadata                                                                                                                                                         | —               | `bun test packages/openapi` + `bun run cli -- openapi:check` → green    |
| `support` (helpers, crypt, collection)                                   | U, C          | happy: `config/env/abort/logger/retry/tap/value/uuid/nowIso/redactForLogs`. error: `abort()` catalogued HTTP error. boundary: ambient scope via AsyncLocalStorage.                                                                                                                                                                          | —                                                                                                                                                                          | —               | `bun test packages/support` → green                                     |
| **`support` crypt (T11)**                                                | U, C          | happy: AES-256-GCM encrypt/decrypt round-trip, key rotation. error: **tamper detection** (modified ciphertext throws). boundary: key from config, missing key → named error.                                                                                                                                                                | fixed key fixture                                                                                                                                                          | —               | `bun test packages/support/tests/crypt.test.ts` → green                 |
| **`support` Collection/Str/Arr (T22)**                                   | U             | happy: collect/map/filter/reduce, `Str`/`Arr` helpers. boundary: empty/large collections.                                                                                                                                                                                                                                                   | —                                                                                                                                                                          | —               | `bun test packages/support` → green                                     |
| `testing` (test app, isolated DB, fakes)                                 | U, I, R       | happy: `createTestContext` boots app on fresh migrated DB, ephemeral server, `TEST_MODE=network` swap. error: **missing URL contract**, **production guard**, **application-URL guard**, cleanup on failure. boundary: create/drop idempotence.                                                                                             | self-tested                                                                                                                                                                | **PG**          | `bun test packages/testing` → green                                     |
| `cli` (create, make:_, db:_, queue:_, workflow:_, schedule:_, feature:_) | U, I, G, C    | happy: every command's `--json` envelope + exit code (0/1/2/3/130), `--dry-run` byte-neutral, marker registration. error: conflict refusal (exit 2), planned commands exit 3 with actionable message, provider-gated hooks. boundary: `list` shows zero "planned" after T19.                                                                | `.tmp/` scratch app                                                                                                                                                        | **PG + RDS**    | `bun test packages/cli` → green; `bun run cli -- list`                  |
| `ai-mcp` (stdio MCP bridge)                                              | U, I          | happy: command admission, argument validation, docs tools, published schemas. error: banned-flag stripping, long-running rejection, envelope fallbacks. boundary: serialized queue (timed-out invocation cannot cancel — assert the **documented limitation**).                                                                             |                                                                                                                                                                            | —               | `bun test packages/ai-mcp` → green                                      |
| **`features` (Feature Builder — new)**                                   | U, I, H, C, X | happy: `defineFeatures`, registry `validate`, resolver topo-sort, `FeaturePlan` construction, `isFullProfile()`. error: **`UNKNOWN_FEATURE` at parse time**, **`MISSING_PREREQUISITE` at bootstrap naming the exact feature**, **`FEATURE_CYCLE`**, **`FEATURE_IN_USE` on remove**. boundary: full profile == today's `create` output (A3). | descriptor catalog                                                                                                                                                         | **PG** (boot)   | `bun test packages/features` → green; every error code asserted by name |
| **`kits` (kit abstraction — new)**                                       | U, I, C       | happy: `KitRegistry.register/adapterFor/capabilities`, 5 narrow ports, adapter swap. error: **`CAPABILITY_UNSUPPORTED` throws with kit name + version** (never fake). boundary: `core` depends on abstraction only; no subsystem imports a kit outside its adapter.                                                                         | fake adapters                                                                                                                                                              | —               | `bun test packages/kits` → green; capability-honesty assertions         |

---

## 3. Infrastructure & Fixtures

### 3.1 Infrastructure matrix

| Service           | Compose service (`deployment/compose.yaml`)  | Port (loopback)                           | Env var consumed by tests                              | Used by                                                               |
| ----------------- | -------------------------------------------- | ----------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| **PostgreSQL 17** | `postgres` (`postgres:17-alpine`)            | `127.0.0.1:54329`                         | `TEST_DATABASE_URL`                                    | database, crud, auth, workflow, notifications, testing, cli, features |
| **Redis 7.4**     | `redis` (`redis:7.4-alpine`)                 | `127.0.0.1:63799`                         | `REDIS_URL`                                            | cache, queue, scheduler, events, notifications, workflow, cli         |
| **MinIO (S3)**    | **`minio` — added by T16**                   | `127.0.0.1:9000` (API) / `9001` (console) | `MINIO_ENDPOINT`/`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` | storage cloud-disk test (T16)                                         |
| **SMTP capture**  | **added by T14** (e.g. `mailhog`/`smtp4dev`) | `127.0.0.1:1025`                          | `SMTP_HOST`/`SMTP_PORT`                                | mail SMTP transport (T14)                                             |

Local bring-up (unchanged, plus the new services once T14/T16 land):

```sh
bun run db:up                       # docker compose -f deployment/compose.yaml up -d --wait
cp .env.test.example .env.test      # TEST_DATABASE_URL + REDIS_URL (+ MINIO_* / SMTP_*)
bun test                            # whole workspace suite
```

CI (`.github/workflows/ci.yml`) already provisions `postgres:17` + `redis:7` services and exports `TEST_DATABASE_URL`, `REDIS_URL`, `DATABASE_URL`. **T14/T16 must extend this job** with a `minio` service and an SMTP capture container (or a `docker run` step), otherwise the SMTP/cloud tests will fail loud (by design — they never silently skip).

### 3.2 The isolated per-run Postgres contract (existing — must not regress)

From `packages/testing/src/test-database.ts`:

- Every DB test gets its own database named `fw_test_<12 hex>`, created from `TEST_DATABASE_URL`.
- Migrations are applied **only** to that throwaway DB, then it is **dropped in success and failure paths** (`drop()` is idempotent).
- `guardTarget()` **refuses** to run when `APP_ENV=production` **or** when `TEST_DATABASE_URL === DATABASE_URL` (`TEST_TARGET_REJECTED`).
- `requireTestDatabaseUrl()` **throws** `TEST_DATABASE_MISSING` with setup instructions — never a silent skip.

**QA assertions on this contract** (they already pass; keep them green as the surface grows):

- creating two databases in one run yields two distinct names; dropping twice is a no-op;
- pointing `TEST_DATABASE_URL` at `DATABASE_URL` throws `TEST_TARGET_REJECTED`;
- `APP_ENV=production` throws `TEST_TARGET_REJECTED`;
- a mid-migration failure still drops the DB (no orphans).

### 3.3 Fixtures

| Fixture                          | Path                                                                                                               | Purpose                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `apps/playground`                | reference app                                                                                                      | Full-profile end-to-end app; contract/RPC + OpenAPI drift tests.                                          |
| **`apps/minimal-feature`** (T05) | `apps/minimal-feature/{bootstrap/features.ts,bootstrap/providers.ts,bootstrap/http.ts,package.json,tsconfig.json}` | The canonical **3-feature** exclusion fixture: `features: ['http','validation','database']`. Gate for §4. |
| Generated scratch app            | `.tmp/` (spawned by CLI tests)                                                                                     | `create` / `make:crud` generated-app gate (L6). Never committed.                                          |
| Factories / seeders              | `@framework/database` `defineFactory`/`defineSeeder`                                                               | Reused by tests **and** `db:seed`; e.g. playground `products` seeder.                                     |
| Ephemeral server                 | `serveOnEphemeralPort` (`packages/testing/src/http.ts`)                                                            | `TEST_MODE=network` CRUD — real loopback transport, `127.0.0.1:0`, always `stop()`ed.                     |
| Fixed clock / fixed TZ           | injected `Date`/`nowIso`; pinned `TZ`                                                                              | Scheduler + timestamp determinism.                                                                        |

### 3.4 Determinism rules (concrete)

```ts
// GOOD — bounded poll with a deadline, fails with observed state
await retry(() => manager.status(id), { attempts: 40, delayMs: 50, until: (s) => s === 'completed' });

// BAD — wall-clock sleep asserting nothing about the failure mode
await sleep(500);
expect(await manager.status(id)).toBe('completed');
```

- Redis keys are namespaced per run (`fwtest:<runId>:...`) and deleted in `afterAll`.
- MinIO objects live under a unique prefix per run and are removed in `afterAll`.
- Network servers always `stop(true)`; DBs always `drop()`.

---

## 4. Feature-Exclusion Verification (the 6 Mechanical Invariants)

Run against `apps/minimal-feature` (`features: ['http','validation','database']`, assumption A2). These are **executable tests**, not prose — `feature:check` executes them and `packages/cli/tests/features.test.ts` re-runs them under `bun test`.

| #   | Invariant                      | Executable check                                                                            | Expected                                                                        |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | **Typecheck clean**            | `bun run typecheck` inside the fixture (scoped `tsc -p apps/minimal-feature/tsconfig.json`) | exit 0, no diagnostics                                                          |
| 2   | **Build succeeds**             | `bun build` the fixture entry points                                                        | exit 0, artifacts emitted                                                       |
| 3   | **Boots**                      | construct `Application` from the resolved `FeaturePlan` and boot                            | registers + boots without error; excluded features absent from `plan.providers` |
| 4   | **Passes its suite**           | run the fixture's own `bun test`                                                            | all green                                                                       |
| 5   | **Dependency-graph assertion** | **import-walk** (see §4.1) from the fixture entry points                                    | **zero** static imports of any excluded `@framework/*` or kit package           |
| 6   | **Clean install**              | `bun install --frozen-lockfile` in a clean tree (fixture `package.json` + root lockfile)    | exit 0 — manifest/lockfile edit is coherent                                     |

### 4.1 Proving #5 is an import-walk, not a grep

The exclusion tool (`packages/cli/src/features/exclusion.ts`) **must**:

1. Start from the fixture's **entry points** (`bootstrap/http.ts`, `bootstrap/providers.ts`, `bootstrap/features.ts`, `bin/*`).
2. Parse each file with a **TypeScript AST** (`ts.createSourceFile`), collect `ImportDeclaration` + `ExportDeclaration` + dynamic `import()` specifiers and `require()` calls.
3. **Resolve** each specifier to a package: workspace `@framework/*` → `packages/<name>/src/index.ts`; kit → `node_modules/@mohamedhabibwork/<kit>`; recurse into resolved files (bounded by a visited-set to survive cycles).
4. Compare the **reachable package set** against `FeaturePlan.excludedPackages`.

**Why this is not a grep** (the assertions that make it an import-walk):

- **Comment/string immunity:** a file containing `// import '@framework/queue'` (a comment) or a string literal `"@framework/queue"` must **not** be flagged. Test: add such a comment to a reachable file → assertion still passes.
- **Transitive reach:** a _reachable_ file that imports an excluded package **indirectly** (fixture → `@framework/http` → some helper that imports `@framework/queue`) must be **flagged** even though the excluded name never appears in the fixture's own source. Test: inject that transitive import → assertion **fails**.
- **Dynamic import:** `await import('@framework/storage')` must be flagged. Test: inject → assertion fails.
- **Positive control:** re-enabling `queue` in `features.ts` and re-running must make the assertion **pass** (the excluded set shrank) — proving the check tracks the plan, not a hard-coded list.

**Acceptance evidence:** `bun test packages/cli/tests/features.test.ts` → green, including the four sub-tests above (comment-immunity, transitive-reach, dynamic-import, positive-control).

> **Non-destructive proof (brief §4b #7).** After `feature:remove queue`, a generated module that imported `@framework/queue` must fail at **compile time** pointing at the removed feature — asserted by expecting a `tsc` diagnostic that names `@framework/queue`. No silent runtime breakage.

---

## 5. Contract + Override Test Specification

### 5.1 The measurable gate (P0-6 / T18)

Two assertions define "every component is replaceable":

1. **Coverage of contracts:** `count(subsystems with an exported contract) == count(subsystems)` — every subsystem exports a public **contract (interface/type)**; no behaviour is reachable only through a concrete class.
2. **One override test per subsystem:** an application-provided fake/alternative binding replaces the default, and the subsystem's own suite still passes against the override.

**Test layout:** one `packages/<subsystem>/tests/<subsystem>.override.test.ts` per subsystem (see the architecture plan T18 file list). **All 22 subsystems** require one.

### 5.2 The override test shape (template)

```ts
// packages/<subsystem>/tests/<subsystem>.override.test.ts
import { describe, expect, test } from 'bun:test';
import { Application } from '@framework/core';
import { CONTRACT_TOKEN, create<Subsystem>Provider } from '../src';

describe('<subsystem> contract is replaceable', () => {
  test('application binding overrides the default without editing the package', async () => {
    const fake = makeFake<SubsystemContract>();          // app-owned alternative
    const app = new Application({
      providers: [create<Subsystem>Provider()],
      bindings: [[CONTRACT_TOKEN, { useValue: fake }]],  // override wins
    });
    await app.boot();
    const resolved = app.container.resolve(CONTRACT_TOKEN);
    expect(resolved).toBe(fake);                         // the override, not the default
    // exercise one real operation through the contract and assert it hit the fake
    expect(await resolved.<op>(...)).toEqual(<expected>);
    await app.shutdown();
  });
});
```

### 5.3 Per-subsystem override matrix

| Subsystem     | Contract (public export)                      | Default binding (provider) | Override asserted                     |
| ------------- | --------------------------------------------- | -------------------------- | ------------------------------------- |
| core          | `Container`/`Resolver`/`ServiceProvider`      | container built-in         | custom `Resolver` impl                |
| http          | `ActorResolver`, structural limiter           | kernel providers           | fake actor resolver + fake limiter    |
| validation    | `FormRequest` hooks                           | validation provider        | fake authz hook                       |
| database      | `DatabaseConnection`, `CrudRepository` mixins | database provider          | in-memory `CrudRepository`            |
| crud          | `CrudRepository`, `ResourceTransform`         | crud provider              | fake repository + transform           |
| auth          | `UserProvider`, `Guard`, `Gate`               | auth provider              | fake `UserProvider` + gate closure    |
| cache         | `CachePort` (kits)                            | `createCacheProvider`      | fake cache adapter                    |
| queue         | `QueueTransportPort` (kits)                   | queue provider             | fake transport                        |
| storage       | `StoragePort` / `StorageDisk`                 | storage provider           | fake disk                             |
| mail          | `MailTransport`                               | `createMailProvider`       | fake transport (MemoryMailTransport)  |
| notifications | `NotificationPort` + channels                 | notifications provider     | fake channel                          |
| events        | `EventBus`                                    | events provider            | fake bus                              |
| scheduler     | schedule store contract                       | scheduler provider         | fake store                            |
| workflow      | action/engine contract                        | workflow provider          | fake action                           |
| openapi       | operation metadata contract                   | openapi provider           | fake metadata source                  |
| logging       | `LoggerPort` (kits)                           | logging provider           | fake logger                           |
| support       | helper contracts                              | support provider           | fake clock/retry                      |
| testing       | `TestDatabase`/`JsonRequester`                | testing helpers            | fake requester                        |
| cli           | `Command`, `ProjectAdapter`                   | cli registry               | fake project adapter                  |
| ai-mcp        | tool contract                                 | ai-mcp provider            | fake tool                             |
| **features**  | `FeatureRegistry`/`FeatureResolver`           | features (pure)            | fake catalog                          |
| **kits**      | 5 ports + `KitAdapter`                        | `KitRegistry`              | swapped adapter (one-file bump proof) |

### 5.4 The two boundary checks (part of T18)

1. **No `any`/`unknown` leakage at contract boundaries.** Assert via a dedicated typecheck: a fixture that resolves each contract and assigns to a `JsonValue`/`ServiceValue`-typed binding must compile with **no** `any`. Evidence: `bun run typecheck` over `packages/*/tests/contract-boundary.types.ts` (type-only, `expectTypeOf`-style assignments).
2. **Capability honesty.** For every kit-backed subsystem, an **unsupported operation throws** `CAPABILITY_UNSUPPORTED` naming the kit + version — **never** returns a fake success. Evidence: `bun test packages/kits` + the cache/storage/queue capability tests; assert the error `code` **and** that the message contains the kit name + version.

**Acceptance evidence for T18:** `bun test` green **and** an audit script/assertion that `count(contracts) == count(subsystems)` (22 == 22) with zero missing override files, recorded in `docs/architecture/pattern-audit.md`.

---

## 6. Coverage Policy

### 6.1 How coverage works today

`bun run coverage` (`scripts/coverage.ts`) runs the **whole workspace suite once** with lcov, aggregates line/function hits **per package**, and enforces thresholds. `--report` measures without enforcing. Test files are excluded; generator template files are ignored via `bunfig.toml`.

**Known limitation (do not fight it):** Bun's coverage only reports files a test run actually _loaded_ — an unimported src file is invisible rather than 0%. The gate is a **regression guard**, not a whole-tree guarantee. The CLI's own number is bounded because its heavy surfaces run in spawned scratch-copy processes.

### 6.2 Threshold policy

- Thresholds are **measured baselines minus a small margin**: they fail on regression, not on a new file landing slightly below today's bar.
- **Net-new packages `features` and `kits` must be added to `THRESHOLDS`** in `scripts/coverage.ts` (T01/T02/T03) with a baseline measured from their suites. **QA merge-blocks** if they are missing (an unmeasured package would otherwise pass silently — see the `no coverage recorded` failure path).
- **Raising a threshold** = improve the suite, then commit the new number **with** the suite change (never raise the number alone).

### 6.3 Current per-package thresholds (baseline to protect)

| Package        | lines          | functions      | Package            | lines          | functions      |
| -------------- | -------------- | -------------- | ------------------ | -------------- | -------------- |
| ai-mcp         | 85             | 59             | notifications      | 94             | 91             |
| auth           | 94             | 90             | openapi            | 99             | 99             |
| cache          | 89             | 89             | queue              | 86             | 84             |
| cli            | 43             | 40             | scheduler          | 84             | 93             |
| core           | 90             | 90             | storage            | 91             | 95             |
| crud           | 91             | 88             | support            | 97             | 88             |
| database       | 85             | 83             | testing            | 99             | 82             |
| events         | 95             | 92             | validation         | 99             | 99             |
| http           | 95             | 64             | workflow           | 89             | 85             |
| logging        | 98             | 93             | apps/playground    | 91             | 66             |
| mail           | 92             | 87             | **features (new)** | **set in T03** | **set in T03** |
| **kits (new)** | **set in T02** | **set in T02** |                    |                |                |

### 6.4 The 427-test regression baseline (must stay green)

- **Baseline:** `bun run test` = `bun test ./packages ./apps` → **427 tests**, all green (last verified 2026-10-06, `docs/status.md`).
- **Rule (A1):** the count may only **grow**; no existing test may be deleted or skipped to make a change pass. Any decrease is a **merge-blocking** finding.
- **Full-profile equivalence (A3):** the all-features profile must reproduce today's `create` output **byte-for-byte** — asserted by `packages/cli/tests/create-app.test.ts` (snapshot/diff of the generated tree).
- **Gate commands (all must exit 0):**

```sh
bun run typecheck      # tsc -p tsconfig.json
bun run lint           # biome check .
bun run test           # 427+ tests
bun run coverage       # per-package thresholds (what CI runs)
```

---

## 7. QA Gates per Delivery Wave

Waves are anchored to the **authoritative build roadmap** in `docs/architecture/end-to-end-delivery-plan.md` (W0–W6, tasks T01–T22). **Merge-blocking** checks cannot be waived; a wave does not advance until its gate is signed off. (The PM's documentation plan is re-anchored to the same table.)

| Wave                                         | Tasks                                  | Merge-blocking checks                                                                                                                                                                                                                                                                                                                                                                                                             | QA sign-off gate                                                                                                                                                                                                                |
| -------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **W0 — Foundations**                         | T01                                    | `bun install --frozen-lockfile`; `typecheck`; `lint`; `test` (427 baseline intact); new packages `features`/`kits` registered in workspaces **and** in `scripts/coverage.ts` `THRESHOLDS` (currently 21 entries, neither present).                                                                                                                                                                                                | Sketches boot; both new packages typecheck; both appear in `THRESHOLDS`.                                                                                                                                                        |
| **W1 — Feature Builder & kit abstraction**   | T02, T03, T04, T05                     | `test`; `coverage`; kit-adapter swap test (one-file bump proof); Feature Builder error codes (`UNKNOWN_FEATURE`, `MISSING_PREREQUISITE`, `FEATURE_CYCLE`) asserted by name; `core` depends on `@framework/kits` only (no `features` import); `feature:list/add/remove/check` envelopes + exit codes; **all 6 exclusion invariants** on `apps/minimal-feature`; import-walk sub-tests (§4.1); non-destructive compile-error proof. | **⛔ QA SIGN-OFF GATE on T05** — QA independently re-runs `feature:check` and the import-walk sub-tests; no exclusion claim accepted without the executable evidence. Resolver is pure + fail-fast; full profile == today (A3). |
| **W2 — One-line CRUD & depth**               | T06, T07, T08, T09                     | Programmatic `.crud()` route-set == CLI route-set; relations/enums/jsonb/composite-key/filter-sort suites on real PG; generated-app gate.                                                                                                                                                                                                                                                                                         | Both CLI and programmatic paths pass the 5-endpoint suite on real Postgres.                                                                                                                                                     |
| **W3 — Parity gap closure**                  | T10, T11, T12, T13, T14, T15, T16, T17 | SMTP over real capture; SMS channel; **MinIO** cloud disk; queuekit inspection port; Gate/crypt/localization/Http:: suites.                                                                                                                                                                                                                                                                                                       | Each kit gap proven on real infra (ADR-11); fakes not accepted as evidence.                                                                                                                                                     |
| **W4 — Delivery surface**                    | T19, T20                               | Node-matrix smoke suite on Bun **and** Node; all `make:*`/`integration:*` exit 0 + typecheck; `list` shows zero "planned".                                                                                                                                                                                                                                                                                                        | Node parity smoke green; generator catalog closed (`list` shows zero planned).                                                                                                                                                  |
| **W5 — Customization audit & documentation** | T18, T21                               | **⛔ QA SIGN-OFF GATE on T18** — one override test per subsystem (22/22); `count(contracts) == count(subsystems)`; no-`any` boundary check; capability-honesty check; Laravel-mapping docs cover every P0/P1 subsystem.                                                                                                                                                                                                           | Replaceability is **measured**, not asserted; recorded in `docs/architecture/pattern-audit.md`; docs traceability complete.                                                                                                     |
| **W6 (optional) — v13 new additions**        | T22                                    | P2 opt-ins additive — no regression against the 427 baseline.                                                                                                                                                                                                                                                                                                                                                                     | P2 opt-ins do not regress the baseline.                                                                                                                                                                                         |

**Wave-exit rule:** a wave is done only when its merge-blocking checks are green **and** (where a sign-off gate exists) QA has recorded the evidence. Coverage regressions and any 427-baseline decrease **block the merge** at every wave.

### 7.1 Gate-ownership split (avoids duplicate scripts)

To prevent two teams writing the same check: **software-engineer owns the CI gate scripts; QA owns the assertions.** QA owns the assertions behind the four documentation gates that overlap its contract/coverage work, specified **here** (not duplicated in the PM's doc-lint scripts):

| Gate    | Assertion (QA-owned)                                                                                                                                                             | Specified in                                        |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **G5**  | **Undocumented public export** — every public export across `packages/*/src` has a doc entry; the assertion is a source-export walk cross-checked against the docs, owned by QA. | This plan (§5.3 override matrix + §9 DoD)           |
| **G7**  | **Undocumented error code** — every code in `@framework/core` `ERROR_CATALOG` has a documented mapping; QA asserts catalog completeness (not the doc script).                    | This plan (§2.2 error paths, §9 DoD)                |
| **G8**  | **Feature/concept coverage** — every catalogued feature has a Laravel-concept entry; QA asserts coverage over the descriptor catalog.                                            | This plan (§2 matrix, §10 traceability, Appendix B) |
| **G11** | **ADR index** — every binding ADR is indexed; QA asserts the index is complete.                                                                                                  | This plan (§1.1 ADR-11, §7 waves)                   |

The PM is recording the mirror-image note (the doc-lint scripts call QA's assertions rather than re-implementing them).

---

## 8. Smart Routing Protocol

After **every** test run, QA makes one routing decision.

| Routing               | Condition                                                                                                                       | Action                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **→ Engineer (Alex)** | The assertion expects the **correct** behaviour (matches PRD/design) but the source returns wrong output / throws unexpectedly. | Send a bug report (format below); **do not** touch the test. |
| **→ QA (self)**       | The **test** is wrong (bad assertion, wrong fixture, wrong expectation vs PRD/design).                                          | Fix the test yourself; count as one round.                   |
| **→ NoOne**           | All tests pass.                                                                                                                 | Report success; exit.                                        |

**Decision rule:** if the assertion encodes the correct behaviour and the implementation disagrees → **source bug** (Engineer). If the assertion itself is wrong → **fix the test** (self).

### 8.1 Max-2-rounds rule (hard limit)

- **Round 1:** write/fix tests → run → analyze → route.
  - All pass → exit (NoOne).
  - Source bugs → bug report to Engineer, wait for fix.
  - Test bugs → fix self (counts as Round 1 complete).
- **Round 2:** re-run regression after the Engineer fix (or the self-fix).
  - All pass → exit (NoOne).
  - Still failing → **exit immediately** and document the remainder as **Known Issues** in the final report.
- **No Round 3.** Extended loops are the #1 cause of slow delivery; remaining edge cases are documented, not endlessly debugged.

### 8.2 Bug report format (evidence required)

```markdown
### Bug — <one-line title>

- **Failing test:** `packages/<pkg>/tests/<file>.test.ts::<test name>`
- **Expected:** <value/behaviour per PRD/design — cite the acceptance criterion>
- **Actual:** <observed value/behaviour>
- **Source file + line:** `packages/<pkg>/src/<file>.ts:<line>` — <function>
- **Evidence:** <error message / stack trace / failing assertion output>
- **Repro:** `<exact command>`
- **Routed to:** Engineer
```

---

## 9. Testing Definition of Done

A feature is **"tested"** only when **all** of the following hold:

- [ ] **Happy path** covered at the appropriate level (L1–L5) with a real assertion (not a smoke call).
- [ ] **Error path(s)** covered: at least one failure mode per public operation, asserting the **catalogued error code** (not just a 500).
- [ ] **Boundary** covered: empty/limit/oversize/malformed inputs for anything with bounds.
- [ ] **Real-infra** proof where the feature's value is infrastructure semantics (Postgres/Redis/MinIO/SMTP) — **no fake-only evidence** (ADR-11).
- [ ] **Contract + override** test exists for the subsystem (T18) and the override wins the binding.
- [ ] **Capability honesty**: any unsupported op **throws** `CAPABILITY_UNSUPPORTED` (kit name + version); nothing is faked.
- [ ] **No `any`/`unknown`** at the contract boundary (typecheck-clean).
- [ ] **Deterministic**: no wall-clock sleeps; fixed clock/TZ where time matters; bounded retries.
- [ ] **Isolated & clean**: own `fw_test_*` DB / namespaced keys / unique MinIO prefix; cleanup in success **and** failure paths.
- [ ] **Generated-app** gate passes if the feature is generated (`create`/`make:*`).
- [ ] **Regression green**: `bun run test` (427+), `bun run coverage`, `bun run typecheck`, `bun run lint` all exit 0.
- [ ] **Docs traceability**: the feature maps to a PRD acceptance criterion (P0/P1/P2) and a Laravel-concept entry where applicable.

---

## 10. Known-Risk / Hard-to-Test Areas

| #   | Risk area                                               | Why hard                                                                                  | How tested / handled                                                                                                                                                                                           | Owner          |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| R1  | **Real-infra flakiness** (Redis pub/sub, BullMQ timing) | Eventual consistency + CI load cause intermittent failures.                               | Bounded `retry()` polls with deadlines (never fixed sleeps); fail with observed state; namespaced keys; deterministic sort keys. CI `concurrency` cancels superseded runs.                                     | QA             |
| R2  | **cachekit Redis tags / namespace-clear unsupported**   | Kit lacks the capability; reimplementing violates ADR-11.                                 | Assert `CAPABILITY_UNSUPPORTED` is **thrown** (never faked); capability matrix test in `packages/cache`.                                                                                                       | QA + Engineer  |
| R3  | **queuekit 0.4.1 job inspection gap**                   | Kit has no inspection surface; framework keeps a documented direct BullMQ path.           | Test the inspection **port** (T17); assert the direct path is labelled; capability honesty on unsupported ops.                                                                                                 | QA + Engineer  |
| R4  | **storagekit cloud drivers (s3/r2/minio/azure/gcs)**    | Only MinIO can run in CI; other drivers need credentials.                                 | Validate **one** cloud disk against **real MinIO** in compose (T16); the rest fail boot with `STORAGE_DRIVER_UNAVAILABLE` (asserted, not silently ignored).                                                    | QA + Engineer  |
| R5  | **notifykit SMS**                                       | Needs a real provider sandbox; may not be available in CI.                                | Test the **channel contract** + failure isolation deterministically; if a live sandbox is unavailable, mark the live-send case as an **explicitly excluded** integration (documented), never a fake "success". | QA + PM        |
| R6  | **TOTP enrolment constraints**                          | RFC 6238 §5 **SHA-256 only**; Google Authenticator cannot enroll (documented limitation). | Assert SHA-256 enrolment works with a known vector; assert the limitation is documented — **do not** "fix" by adding the weak variant.                                                                         | QA             |
| R7  | **Node runtime matrix (T20)**                           | Bun is the only _validated_ runtime; Node parity is secondary.                            | Smoke suite run on **both** Bun and Node in CI; any Bun-only behaviour is a documented divergence, not a silent pass.                                                                                          | QA + Architect |
| R8  | **Feature-exclusion false negatives**                   | A grep could pass while a transitive/dynamic import still reaches an excluded package.    | Import-walk (AST) with comment-immunity, transitive-reach, dynamic-import, and positive-control sub-tests (§4.1) — the anti-grep proof.                                                                        | QA             |
| R9  | **SMTP transport without a capture server**             | A live SMTP endpoint is unavailable in CI by default.                                     | Add an SMTP capture container (T14); tests **fail loud** if `SMTP_*` is unset (no silent skip).                                                                                                                | QA + Engineer  |
| R10 | **ai-mcp timed-out invocation cannot cancel**           | In-process serialized queue stays busy until settle (documented limitation).              | Assert the **documented limitation** (queue stays busy) rather than pretending cancellation works.                                                                                                             | QA             |
| R11 | **Coverage blind spots**                                | Bun reports only loaded files; unimported src is invisible.                               | Treat thresholds as regression guards; explicitly **fail** when a gated package records **no** coverage (existing `no coverage recorded` path).                                                                | QA             |
| R12 | **Byte-equivalence of full-profile `create` (A3)**      | Any drift in generated output regresses every existing app.                               | `packages/cli/tests/create-app.test.ts` snapshot/diff; blocking at every wave.                                                                                                                                 | QA             |

---

## Appendix A — QA command reference

```sh
# Bring up infra (Postgres + Redis; MinIO/SMTP added by T14/T16)
bun run db:up

# Full regression (all must exit 0)
bun run typecheck
bun run lint
bun run test                 # 427+ tests
bun run coverage             # per-package thresholds (what CI runs)

# Per-subsystem (examples)
bun test packages/features   # Feature Builder unit + error codes
bun test packages/kits       # kit ports + capability honesty
bun test packages/crud       # CRUD HTTP feature + programmatic API
bun test packages/cli        # generators + generated-app + feature:check

# Feature-exclusion gate (T05)
bun run cli -- feature:check
bun test packages/cli/tests/features.test.ts

# Generated-app gate
bun run cli -- create apps/<tmp> && bun run cli -- make:crud Product --module products --verify --test-mode network
```

## Appendix B — Requirement → test traceability (P0)

| PRD ID | Requirement                                | Primary test evidence                                                             | Level    |
| ------ | ------------------------------------------ | --------------------------------------------------------------------------------- | -------- |
| P0-1   | Feature Builder (declare/add/remove)       | `packages/features/tests/*`, `packages/cli/tests/features.test.ts`, §4 invariants | L1/L7    |
| P0-2   | Programmatic one-call CRUD                 | `packages/crud/tests/resource.test.ts` (route-set == CLI)                         | L1/L3/L5 |
| P0-3   | Generator depth: relations/enums/jsonb     | `packages/crud/tests/{relations,transform}.test.ts` + generated fixture           | L5/L6    |
| P0-4   | Kit gaps closed (queuekit/notifykit/cloud) | `packages/{queue,notifications,storage}/tests` on real Redis/sandbox/MinIO        | L5       |
| P0-5   | SMTP transport                             | `packages/mail/tests/smtp.test.ts` (real capture)                                 | L5       |
| P0-6   | Contract + override per subsystem          | 22 `*.override.test.ts` + `count(contracts)==count(subsystems)` (T18)             | L4       |
| P0-7   | Remaining `make:*`/`integration:*`         | `packages/cli/tests/generators.test.ts`; `list` shows zero planned                | L6       |
| P0-8   | Resource/transform layer                   | `packages/crud/tests/transform.test.ts` (date/decimal mapping)                    | L1/L3    |
| P0-9   | Laravel-concept mapping docs               | Doc-coverage assertion over `docs/architecture/laravel-concept-map.md` (T21)      | L8       |
