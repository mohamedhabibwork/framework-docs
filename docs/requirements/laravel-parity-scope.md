# Requirements & Scope Brief — Laravel v13 Parity Framework (ORM excluded)

**Owner:** Alice (Product Manager) · **Consumer:** Architect · **Status:** Draft for architecture
**Source of truth for "what exists":** `docs/status.md` (last verified 2026-10-06) + `packages/*/package.json`

---

## 1. Project Information

| Field                                      | Value                                                                                                                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project name (snake_case)                  | `hono_laravel_framework` (working name; repo root stays `hono-framework`)                                                                                                                     |
| Language                                   | English                                                                                                                                                                                       |
| Programming language / stack               | TypeScript 5.9.3 on **Bun 1.4.2** (only validated runtime), **Hono 4.13.12**, **Drizzle ORM 0.45.3 + drizzle-kit 0.31.11**, **Zod 4.6.5**, PostgreSQL 17, Redis (BullMQ 6.3.11), Biome 2.5.15 |
| Explicitly **OUT of scope**                | **The ORM.** No Eloquent clone, no second query engine, no ActiveRecord-style model layer with its own schema source. Thin model metadata/serialization over Drizzle is permitted (spec §5).  |
| Kit dependencies (must be wired into core) | `@mohamedhabibwork/cachekit@0.2.1`, `storagekit@0.6.1`, `queuekit@0.4.1`, `loggerkit@0.2.2`, `notifykit@0.4.1`                                                                                |
| Repo shape                                 | Bun workspace: `packages/*` (`@framework/*`), `apps/playground` (reference app), `apps/demo-api`, `apps/docs` (Starlight)                                                                     |

### Requirement restatement

The user already owns a working Laravel-inspired framework on Hono: 21 `@framework/*` packages, 427 passing tests, validated phases 0–6, a one-command CRUD generator, and five `@mohamedhabibwork/*` kits adapted behind framework contracts. The request is **not a greenfield build** — it is to (1) close the remaining **Laravel v13 subsystem parity gaps** (ORM excluded), (2) make the five kits **first-class citizens of the core** rather than peripheral adapters, (3) guarantee **one-line CRUD**, (4) add a **Feature Builder** that lets a developer include only the subsystems they need and _remove_ the ones they no longer require, and (5) guarantee **every component is replaceable** — all under SOLID and established design patterns. Deliverable: architecture plan + task breakdown + assignment.

---

## 2. Product Goals

1. **Parity** — Every Laravel v13 subsystem that does not depend on the ORM is either implemented and validated, or explicitly deferred with a written decision. No subsystem is silently absent.
2. **Composability** — A developer can declare the exact set of subsystems their application uses, get only those, and **remove** a subsystem later without breaking the rest or hand-editing the framework.
3. **Extensibility & velocity** — One call/command produces a complete working CRUD resource, and every subsystem's contract, binding, and adapter can be replaced by an application without forking a package.

Goals are orthogonal: parity is _breadth_, composability is _lifecycle_, extensibility/velocity is _depth of the seams_.

---

## 3. Laravel v13 Feature Parity Matrix (ORM excluded)

Status legend — **Implemented**: working + covered by a passing automated test in `bun run test` (per `status.md`). **Partial**: exists but with documented gaps. **Missing**: not present in the repo. **Deferred**: intentionally out of first-release scope (needs a written decision).

Requirement level: **must** = P0, **should** = P1, **could** = P2.

| #   | Laravel subsystem                                                                      | Repo status                                                                                                       | Where                                                             | Requirement                                          |
| --- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | Routing (groups, named routes, route params, route:list)                               | Implemented                                                                                                       | `@framework/http` `routing/`                                      | must — extend, don't rebuild                         |
| 2   | Middleware (aliases, groups, ordering)                                                 | Implemented                                                                                                       | `@framework/http` `middleware/registry.ts`                        | must                                                 |
| 3   | Service container / IoC (singleton, scoped, transient, cycle detection)                | Implemented                                                                                                       | `@framework/core` `container/`                                    | must                                                 |
| 4   | Service providers (ordering, deferred, partial-boot cleanup)                           | Implemented                                                                                                       | `@framework/core` `providers/`                                    | must                                                 |
| 5   | Config (validated, frozen, env precedence)                                             | Implemented                                                                                                       | `@framework/core` `config/`                                       | must                                                 |
| 6   | Facades / context-aware static accessors                                               | **Missing**                                                                                                       | —                                                                 | could — spec §2 calls them optional conveniences     |
| 7   | Validation                                                                             | Implemented                                                                                                       | `@framework/validation`                                           | must                                                 |
| 8   | Form requests (+ authorization hooks)                                                  | Implemented                                                                                                       | `@framework/validation` `form-request.ts`                         | must                                                 |
| 9   | HTTP resources / response serialization                                                | Partial                                                                                                           | `@framework/crud` `ResourceController` serialization              | must — add a declarative resource/transform layer    |
| 10  | JSON:API resources (**new in v13**)                                                    | **Missing**                                                                                                       | —                                                                 | could                                                |
| 11  | Authentication — guards / providers / sessions / tokens                                | Implemented                                                                                                       | `@framework/auth`                                                 | must                                                 |
| 12  | Passkey / WebAuthn auth (**new in v13**)                                               | **Missing**                                                                                                       | —                                                                 | could                                                |
| 13  | Authorization — policies                                                               | Implemented                                                                                                       | `@framework/auth` `policies/`, `@framework/http` `authorization/` | must                                                 |
| 14  | Authorization — `Gate` registry (closure-based abilities, `Gate::define/before/after`) | **Missing** (only policy objects exist)                                                                           | —                                                                 | should                                               |
| 15  | Events & listeners (incl. queued listeners)                                            | Implemented                                                                                                       | `@framework/events`                                               | must                                                 |
| 16  | Queues & jobs (retries, backoff, timeout, batches, idempotency)                        | Implemented                                                                                                       | `@framework/queue` (QueueKit + BullMQ)                            | must                                                 |
| 17  | Failed jobs (list / retry / forget / prune / pause / resume)                           | Implemented                                                                                                       | `@framework/queue` + CLI                                          | must                                                 |
| 18  | Scheduling (cron, timezone, overlap, distributed lock)                                 | Implemented                                                                                                       | `@framework/scheduler`                                            | must                                                 |
| 19  | Cache (stores, TTL, locks, counters, tags)                                             | Partial — CacheKit tags/namespace-clear unsupported                                                               | `@framework/cache`                                                | must — `should` add `Cache::touch` (v13)             |
| 20  | Mail (message builders, templates, transports, fakes)                                  | Partial — **SMTP deferred**                                                                                       | `@framework/mail`                                                 | must — SMTP is table stakes                          |
| 21  | Notifications (email/database/push/messaging channels)                                 | Partial — **SMS deferred**                                                                                        | `@framework/notifications` (NotifyKit)                            | must — SMS channel                                   |
| 22  | Storage / filesystem (disks, visibility, signed URLs)                                  | Partial — local validated; s3/r2/minio/azure/gcs fail boot                                                        | `@framework/storage` (StorageKit)                                 | must — validate at least one cloud disk              |
| 23  | Sessions                                                                               | Implemented                                                                                                       | `@framework/auth` `sessions/`                                     | must                                                 |
| 24  | Encryption / hashing                                                                   | Partial — argon2id hashing yes; **no generic `Crypt` encrypt/decrypt**                                            | `@framework/auth`                                                 | should — needed for app-level secret encryption      |
| 25  | Localization / translations (`__()`, locale switching)                                 | **Missing** (only Hono's native `language` middleware)                                                            | —                                                                 | should                                               |
| 26  | Blade-like view / templating                                                           | **Deferred** — Hono JSX is available; spec §11 makes rendering optional                                           | —                                                                 | deferred — needs a written decision                  |
| 27  | Rate limiting                                                                          | Implemented                                                                                                       | `@framework/cache` `RateLimiter` + `@framework/http` `throttle`   | must                                                 |
| 28  | Artisan-like CLI + generators                                                          | Partial — `make:crud`, `create`, 16 `make:*` validated; 9 `make:*` + `integration:*` + `db:rollback` still exit 3 | `@framework/cli`                                                  | must — close the generator catalog                   |
| 29  | Testing helpers (test app, fakes, isolated DB, factories)                              | Implemented                                                                                                       | `@framework/testing`, `@framework/database` factories             | must                                                 |
| 30  | Error handling / exceptions (`abort`, catalogued errors, onError envelope)             | Implemented                                                                                                       | `@framework/http` `errors/`, `@framework/support`                 | must                                                 |
| 31  | Logging (structured, redacted, correlated)                                             | Implemented                                                                                                       | `@framework/logging` (LoggerKit)                                  | must                                                 |
| 32  | Broadcasting / realtime                                                                | Partial — in-process + Redis pub/sub + WebSocket hub; no dedicated broadcast server                               | `@framework/events` `RealtimeHub`                                 | should                                               |
| 33  | HTTP client (outbound `Http::` facade)                                                 | **Missing**                                                                                                       | —                                                                 | should                                               |
| 34  | Pagination                                                                             | Implemented                                                                                                       | `@framework/database` `pagination/`                               | must                                                 |
| 35  | Collections / helpers (`collect()`, `tap`, `value`, `retry`)                           | Partial — helpers yes, no `Collection`                                                                            | `@framework/support`                                              | could                                                |
| 36  | String / array helpers (`Str`, `Arr`)                                                  | **Missing**                                                                                                       | —                                                                 | could                                                |
| 37  | Workflow / pipeline                                                                    | Implemented (exceeds Laravel: durable saga engine)                                                                | `@framework/workflow`, `@framework/core` `pipeline.ts`            | must                                                 |
| 38  | Health checks (liveness + readiness)                                                   | Implemented                                                                                                       | `/health`, `/health/ready`                                        | must                                                 |
| 39  | API documentation (OpenAPI 3.1)                                                        | Implemented                                                                                                       | `@framework/openapi`                                              | must                                                 |
| 40  | Feature flags / staged rollouts (Pennant)                                              | **Missing**                                                                                                       | —                                                                 | could — **overlaps the Feature Builder requirement** |
| 41  | Queue dashboard / Horizon-like ops UI                                                  | **Missing**                                                                                                       | —                                                                 | could                                                |
| 42  | Search / indexing (Scout)                                                              | **Missing**                                                                                                       | —                                                                 | could                                                |
| 43  | Social / OAuth login (Socialite)                                                       | **Missing**                                                                                                       | —                                                                 | could                                                |
| 44  | AI SDK / agents / semantic search (**new in v13**)                                     | **Missing** — `@framework/ai-mcp` is an MCP server, not an AI SDK                                                 | `@framework/ai-mcp` (different concern)                           | could — depends on answer to Open Question Q1        |
| 45  | Concurrency / process / prompts utilities                                              | **Missing**                                                                                                       | —                                                                 | could                                                |
| 46  | Frontend build (Vite), Folio/Volt, Cashier, Nova, Envoy, Dusk                          | **Out of scope**                                                                                                  | —                                                                 | n/a — not applicable to a Hono API framework         |

### Parity summary

- **Implemented & validated:** 22 subsystems (items 1–5, 7–8, 11, 13, 15–18, 23, 27, 29–31, 34, 37–39).
- **Partial (documented gap):** 9 (items 9, 19–22, 28, 32, 35).
- **Missing:** 11 (items 6, 10, 12, 14, 24–25, 33, 36, 40–44, 45) — of which 4 are `must`/`should`.
- **Deferred / n/a:** 5 (item 26 + item 46 group).

**The plan must not re-plan finished work.** Net-new work is: the _partials_, the _missing must/should_ items, and the three differentiators in §4 (Feature Builder is entirely net-new).

---

## 4. The Four Differentiating Requirements — Acceptance Criteria

### 4a. One-line CRUD — **mostly implemented, needs depth**

A single command yields a full working CRUD resource, verified end to end.

| #   | Acceptance criterion                                                                                                                                                                                               | Current                                 | Target                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | --------------------------------------------------------------------- |
| 1   | `make:crud Product --module products --fields '…' --verify` generates table, schemas, requests, DTOs, repository, service, controller, policy, native Hono routes, OpenAPI metadata, factory, migration, API tests | ✅ validated                            | keep                                                                  |
| 2   | `make:crud Product --module products --table products --verify` works against an existing Drizzle table                                                                                                            | ✅ validated (uuid/integer/serial `id`) | keep                                                                  |
| 3   | `--verify` runs typecheck + the 5-endpoint suite against an **isolated real PostgreSQL** DB and reports per-endpoint results; nonzero on failure; cleanup in both paths                                            | ✅ validated                            | keep                                                                  |
| 4   | **`--access public\|authenticated`** with 401/403 cases; `--soft-delete`; `--dry-run` byte-neutral; conflict + route-collision refusal                                                                             | ✅ validated                            | keep                                                                  |
| 5   | **Relations** (`belongsTo`/`hasMany` from Drizzle FKs) + allowlisted `?include=`                                                                                                                                   | ❌ rejected rather than guessed         | **must**                                                              |
| 6   | **Enums (`pgEnum` → `z.enum`) and `jsonb` columns**                                                                                                                                                                | ❌ rejected                             | **must**                                                              |
| 7   | **Composite / non-`id` primary keys**                                                                                                                                                                              | ❌ single `id` only                     | **should**                                                            |
| 8   | **`--owned-by <field>`** row-scoped generation (service-level `ownedBy()` exists but is not a flag)                                                                                                                | ❌ not a flag                           | **should**                                                            |
| 9   | Validated filter/sort DSL (`?filter[field][op]=`, `?sort=`) documented in OpenAPI                                                                                                                                  | ❌                                      | **should**                                                            |
| 10  | A programmatic one-call API (not only the CLI): e.g. `defineResource(products).crud()` producing the same registered routes                                                                                        | ❌                                      | **must** — "single line" must be true at runtime, not only in a shell |

> **Definition of done:** in a clean `create`-generated app, both CLI and programmatic paths produce a resource whose 5 endpoints pass against real PostgreSQL, with relations/enums/JSON included, no private-field exposure, no overwritten unrelated files.

### 4b. Feature Builder — **entirely net-new (highest-risk item)**

A developer declares which subsystems they need; unneeded ones are excluded; removing a feature later does not break the rest.

| #   | Acceptance criterion                                                                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A single declaration point (e.g. `bootstrap/features.ts` / `defineFeatures([...])`) lists every subsystem: `http`, `validation`, `database`, `auth`, `cache`, `queue`, `events`, `scheduler`, `workflow`, `storage`, `mail`, `notifications`, `logging`, `openapi`, `testing`, `cli`, `realtime`, `ai-mcp`.                                    |
| 2   | Enabling a feature registers its provider(s), config schema, routes, CLI commands and generated artifacts — with **no** manual wiring the developer must hand-write.                                                                                                                                                                           |
| 3   | **Disabling** a feature removes: its provider registration, its config section, its CLI commands (exit 3 with an actionable message), its route families, and its **package dependency** from `package.json` + lockfile.                                                                                                                       |
| 4   | **Removal is verified, not asserted:** a generated app with `features: ['http','validation','database']` must (a) typecheck, (b) build, (c) boot, (d) pass its suite, and (e) have **zero** imports of excluded `@framework/*` packages — checked mechanically (dependency-graph assertion + `bun install --frozen-lockfile` in a clean tree). |
| 5   | Dependency correctness: requesting a feature whose prerequisites are absent fails at **bootstrap** with a named missing-feature error, not a runtime crash. Requesting an unknown feature fails at parse time.                                                                                                                                 |
| 6   | **Feature-to-feature compatibility matrix** is declared in code and documented: e.g. `queue` requires `core`; `workflow` requires `database` + `queue`; `notifications` requires `mail` (email channel) or stands alone.                                                                                                                       |
| 7   | Removing a feature is **non-destructive to user code**: generated modules that referenced it produce a compile-time error pointing at the removed feature, never silent breakage.                                                                                                                                                              |
| 8   | The Feature Builder itself is opt-out-safe: a "full" profile (all features) equals today's behaviour — the default `create` output must not regress.                                                                                                                                                                                           |
| 9   | Tree-shaking claim is honest: the brief requires **build-time exclusion + dependency removal**, not a runtime `if (enabled)` guard pretending to be removal.                                                                                                                                                                                   |
| 10  | CLI surface: `feature:list` (declared + enabled + availability), `feature:add <name>` (wires it), `feature:remove <name>` (unwires it + dependency), `feature:check` (verifies the exclusion invariants of #4).                                                                                                                                |

> **Open design decision for the architect:** physical code/file removal vs. workspace package-dependency removal + build-time exclusion. Criterion #4's mechanical check works for both; the difference is whether `@framework/*` sources are also pruned. Must be answered explicitly (see Q5).

### 4c. Full customization of every component — **partially there, needs a completeness audit**

Every subsystem's contract, binding, and adapter is replaceable by the application.

| #   | Acceptance criterion                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Every subsystem exposes a **contract (interface/type)** in its public exports; no subsystem's behaviour is reachable only through a concrete class.                                                                                |
| 2   | Every contract has a **default binding registered by its provider** and can be **overridden by an application binding** without editing the package.                                                                               |
| 3   | **Override test per subsystem:** an application-provided fake/alternative binding replaces the default and the subsystem's own suite still passes against the override. One such test per subsystem — this is the measurable gate. |
| 4   | Every adapter declares **capabilities** and reports unsupported operations explicitly rather than faking them (existing pattern: StorageKit `signedUrl`, CacheKit tags, QueueKit inspection).                                      |
| 5   | No captive dependencies: a scoped service never captures a singleton that captured a scoped service (container already detects this — extend coverage to all subsystems).                                                          |
| 6   | Configuration is validated and typed per subsystem; a missing/invalid config section fails at boot with a named error.                                                                                                             |
| 7   | Design-pattern inventory is documented per subsystem (see §7) so "SOLID applied throughout" is auditable, not asserted.                                                                                                            |
| 8   | Public types avoid `any`/`unknown` leakage at contract boundaries (existing rule: `JsonValue`/`ServiceValue` discipline).                                                                                                          |

### 4d. `@mohamedhabibwork/*` kits wired into core — **mostly there (ADR-11), scope must be confirmed**

| #   | Acceptance criterion                                                                                                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | All five kits (`cachekit`, `storagekit`, `queuekit`, `loggerkit`, `notifykit`) are adapted behind framework contracts, pinned to exact versions, and exercised end to end.                                                                                                                                                                   | ✅ largely done |
| 2   | Every kit-backed subsystem is bound through a **framework provider** and reachable from the container by token — not imported directly by application code.                                                                                                                                                                                  |
| 3   | Kit **capability gaps are surfaced, never reimplemented**: cachekit Redis tags/namespace-clear, queuekit 0.4.1 job inspection, storagekit cloud drivers, notifykit SMS. Where a kit lacks a capability, the framework either documents the limitation or keeps a **documented direct path** — never a silent second implementation (ADR-11). |
| 4   | Close the current kit gaps: **queuekit job-inspection surface** (today the framework keeps a direct BullMQ handle for inspection/retry/pause), **notifykit SMS**, **storagekit cloud disk** (at least one of s3/r2/minio validated).                                                                                                         |
| 5   | **"Into its core" is satisfied** by: kits registered as core-level providers with first-class config sections + CLI hooks (`cache`, `sessions`, `queue` hooks exist today) — **or** the stronger reading that `@framework/core` depends on the kits. This reading must be confirmed (Q4).                                                    |
| 6   | A kit version bump is a **one-file change** behind the adapter (ADR-3/ADR-11 pattern), proven by a test that swaps the adapter implementation.                                                                                                                                                                                               |
| 7   | A generated application from `create` ships the same kit providers, config sections and CLI hooks as the playground (already gate-tested).                                                                                                                                                                                                   | ✅              |

---

## 5. User Stories

1. **As an application developer**, I want to run one command and get a working, tested, OpenAPI-documented CRUD resource (including relations and enums), so that I never hand-write repository/controller/policy/validation boilerplate again.
2. **As an application developer**, I want to declare the features my app needs and have everything else genuinely removed (code, commands, dependencies), so that my production image and dependency tree contain only what I use.
3. **As an application developer**, I want to replace any subsystem's implementation with my own binding, so that I can adopt the framework without being locked into its defaults.
4. **As an application developer**, I want the `@mohamedhabibwork/*` kits I already use to be first-class framework providers with config sections and CLI hooks, so that I do not write glue code or maintain two integration styles.
5. **As a framework maintainer**, I want every subsystem to expose a contract with an override test, so that adding or replacing an adapter never requires touching consumers.
6. **As a Laravel developer migrating to TypeScript**, I want a documented Laravel-concept → framework-concept map for every subsystem, so that I can find the equivalent of `Gate`, `Http::`, `__()`, and `Cache::touch` without guessing.

---

## 6. Requirements Pool

### P0 — Must have (blocks "complete framework")

| ID   | Requirement                                                                 | Measurable acceptance criteria                                                                                                     |
| ---- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| P0-1 | Feature Builder (declare / add / remove subsystems)                         | §4b criteria 1–10 all pass; a 3-feature app typechecks, builds, boots, passes its suite, and has zero imports of excluded packages |
| P0-2 | Programmatic one-call CRUD API                                              | `defineResource(table).crud()` registers the same 5 routes as the CLI path; endpoint suite green against real PostgreSQL           |
| P0-3 | CRUD generator depth: relations + enums + `jsonb`                           | Generated resource with a `belongsTo` relation and a `pgEnum` column passes the full generated suite                               |
| P0-4 | Kit gaps closed: queuekit inspection, notifykit SMS, one cloud storage disk | Each validated against real infrastructure (Redis / provider sandbox / MinIO in compose)                                           |
| P0-5 | SMTP mail transport                                                         | Real SMTP transport replaces `SMTP_PLANNED`; queued-by-default; failure/retry test                                                 |
| P0-6 | Contract + override test for **every** subsystem                            | One override test per subsystem; count of subsystems with a contract == count of subsystems                                        |
| P0-7 | Remaining `make:*` + `integration:*` CLI generators                         | All planned `make:*` commands exit 0 and produce typechecking code; `list` shows zero "planned" generators                         |
| P0-8 | Declarative HTTP resource/transform layer (item 9)                          | Resource class maps a Drizzle row → public payload; tested projection incl. date/decimal mapping                                   |
| P0-9 | Laravel-concept mapping documentation                                       | Every P0/P1 subsystem has a `Laravel concept → framework equivalent` doc entry                                                     |

### P1 — Should have

| ID    | Requirement                                                              | Measurable acceptance criteria                                                 |
| ----- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| P1-1  | `Gate` registry (closure abilities, `before`/`after`) alongside policies | `Gate.define/before/after/allows/denies` with tests; policies still supported  |
| P1-2  | Generic `Crypt` encrypt/decrypt (AES-GCM, key from config)               | Round-trip test, tamper test, key-rotation test                                |
| P1-3  | Localization (`__()`, locale middleware, message catalogs)               | Locale switch via header/route; missing-key fallback; tested                   |
| P1-4  | Outbound HTTP client (`Http::`)                                          | Retry/timeout/JSON helpers, test fake transport, tested                        |
| P1-5  | Composite / non-`id` primary keys in CRUD generation                     | Generated resource with composite key passes endpoint suite                    |
| P1-6  | `--owned-by` generation flag + `?include=` relations DSL in OpenAPI      | Row-scoped resource: cross-owner read/write → 404; OpenAPI documents `include` |
| P1-7  | Validated filter/sort DSL                                                | `?filter[price][gte]=10&sort=-created_at` tested + documented in OpenAPI       |
| P1-8  | `Cache::touch` (v13 parity)                                              | Extends TTL without re-fetch; tested on memory + Redis                         |
| P1-9  | Broadcasting hardening / dedicated realtime path                         | Documented broadcast contract; cross-instance delivery test                    |
| P1-10 | `db:rollback` decision executed (implement or formally close)            | Either works with production guards, or ADR records forward-only permanently   |

### P2 — Could have

| ID    | Requirement                               | Notes                                                                    |
| ----- | ----------------------------------------- | ------------------------------------------------------------------------ |
| P2-1  | JSON:API resources (v13)                  | Only if the target audience needs the spec                               |
| P2-2  | Passkey / WebAuthn (v13)                  | Additive to `@framework/auth`                                            |
| P2-3  | Facades                                   | Spec calls them optional conveniences                                    |
| P2-4  | `Collection` + `Str`/`Arr` helpers        | Laravel familiarity                                                      |
| P2-5  | Feature flags (Pennant-like)              | Distinct from the Feature Builder — runtime flags vs build-time features |
| P2-6  | Queue dashboard / Horizon-like UI         | Ops convenience                                                          |
| P2-7  | Search / Scout-like indexing              |                                                                          |
| P2-8  | Socialite-like OAuth                      |                                                                          |
| P2-9  | AI SDK / agents / semantic search (v13)   | Blocked on Q1                                                            |
| P2-10 | Concurrency / process / prompts utilities |                                                                          |
| P2-11 | OpenTelemetry tracing + metrics           | Already in the enhancement plan M7                                       |

---

## 7. Design Constraints (SOLID & patterns)

The user explicitly requires SOLID and "other relevant design patterns". The architecture plan must state, per subsystem, which pattern is used and why. Already-established patterns to extend, not replace:

| Principle                       | Existing evidence                                                                                                | Must be preserved/extended                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **S**RP                         | `@framework/http` kernel vs routing vs errors; `crud` service vs controller                                      | Every new subsystem separates contract / implementation / provider                     |
| **O**CP                         | Mixins (`Readable/Creatable/Updatable/Deletable/SoftDeletable`) extend repository behaviour without modification | New CRUD operations (relations, composite keys) as mixins, not `if` branches           |
| **L**SP                         | All storage disks satisfy `StorageDisk`; all cache engines satisfy the cache contract                            | New adapters must be drop-in                                                           |
| **I**SP                         | Narrow contracts (`MailTransport`, `UserProvider`, `LockStore`, structural limiter)                              | Reject fat contracts; split when a consumer needs only part                            |
| **D**IP                         | Providers bind contracts to adapters (ADR-11); app overrides bindings                                            | No direct kit/package imports in application code                                      |
| Adapter / Ports & Adapters      | ADR-11 kit adapters, Drizzle–Zod adapter (ADR-3)                                                                 | Feature Builder must not couple core to adapters                                       |
| Strategy                        | Auth guards (`session`, `api-token`, `jwt`), queue backends                                                      | Feature Builder toggles strategies without branching core                              |
| Factory                         | `defineFactory`, provider factories (`createCacheProvider`)                                                      | Generators emit factories                                                              |
| Registry                        | Command registry, middleware registry, listener registry, feature registry (new)                                 | Feature Builder is a registry + resolver                                               |
| Decorator / Middleware          | Hono middleware, `child()` logger, audit mixin                                                                   | Preferred over subclassing                                                             |
| Template Method                 | `ResourceService` lifecycle hooks (`beforeCreate`/`afterUpdate`)                                                 | Customization without forking                                                          |
| Saga / Compensating transaction | `@framework/workflow` `compensate`                                                                               | Reuse for multi-subsystem removal/rollback if needed                                   |
| Builder                         | `Mailer`, `pipeline().through()`                                                                                 | The **Feature Builder** follows this established style                                 |
| Facade (optional)               | none                                                                                                             | If added (P2-3), must be context-scoped with explicit errors outside a scope (spec §2) |

**Non-negotiable architectural invariants** (from `framwork.md`, must survive the Feature Builder):

- Hono's native `Context`/`Request`/`Response`/`next()` behaviour is preserved; native middleware keeps working.
- The error boundary is Hono's `onError`, never a `try/catch` around `await next()` (ADR-5).
- Registration is explicit with `// @framework:*` markers; missing markers and duplicates are errors (ADR-6).
- Migrations are a release step, never run on server/worker boot (ADR-9).
- Capabilities are reported honestly, never faked (ADR-11).
- Public access is never silently generated (ADR-8).

---

## 8. Open Questions & Assumptions

| ID     | Question / assumption                                                                                                                                                                                      | Impact if wrong                                                                                  | Needs                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------- |
| **Q1** | Does "all features found in Laravel v13" include v13's **new** additions — AI SDK / AI agents, JSON:API resources, passkey auth, semantic search (pgvector), `Cache::touch`? Or the classic subsystem set? | P2 scope swings by ~5 subsystems; P1-8 depends on this                                           | **User confirmation** |
| **Q2** | Is **Blade-like templating** in scope, or deferred per spec §11 (Hono JSX as the optional rendering path)?                                                                                                 | Adds a whole subsystem (views, layouts, directives)                                              | **User confirmation** |
| **Q3** | "Except the ORM" — is **thin model metadata** (serialization, scopes, soft-delete, relations metadata) allowed, or is every model-like concept excluded?                                                   | Changes how relations in P0-3 are exposed                                                        | **User confirmation** |
| **Q4** | "Wired into its **core**" — (a) kits registered as core-level providers with config + CLI hooks (today's ADR-11 shape), or (b) `@framework/core` directly depends on the kits?                             | (b) couples core to 5 external packages and weakens replaceability (§4c)                         | **User confirmation** |
| **Q5** | Feature **removal** semantics: physical source/file pruning, or package-dependency removal + build-time exclusion?                                                                                         | Determines the Feature Builder's whole design (§4b #4)                                           | **User + architect**  |
| **Q6** | Must the framework become **publishable** `@framework/*` npm packages, or stay a private Bun workspace?                                                                                                    | Publishing changes versioning, peer deps, and the Feature Builder's dependency-removal mechanism | **User confirmation** |
| **Q7** | Is **Node runtime** in scope, or does Bun-only stay?                                                                                                                                                       | New adapter + test matrix (ADR-1, M5.4)                                                          | **User confirmation** |
| **Q8** | Target of parity: "Laravel v13 behaviour" or "Laravel v13 developer ergonomics"?                                                                                                                           | Behaviour parity ⇒ exact API semantics; ergonomics ⇒ TS-idiomatic equivalents accepted           | **User confirmation** |
| **A1** | Assumption: the existing 427-test suite stays green throughout; no subsystem is rewritten that already passes its gate.                                                                                    | Re-planning finished work wastes the largest available effort                                    | —                     |
| **A2** | Assumption: `apps/playground` remains the reference app and the Feature Builder's gate fixture.                                                                                                            | Need a second, minimal-feature fixture app (the 3-feature app of P0-1)                           | —                     |
| **A3** | Assumption: the Feature Builder is additive — the "full profile" reproduces today's `create` output exactly.                                                                                               | Regression risk for every existing generated app                                                 | —                     |
| **A4** | Assumption: kit gaps (queuekit inspection, notifykit SMS, storagekit cloud) are **surfaced or worked around with a documented direct path**, not reimplemented (ADR-11).                                   | Contradicts ADR-11 if violated                                                                   | —                     |

---

## 9. What the Architect Should NOT Re-Plan

Already implemented **and** covered by passing automated tests — treat as fixed inputs:

- Container, providers, config, lifecycle, request scope, error envelope, redaction (`@framework/core`, `@framework/http`).
- Validation + form requests (`@framework/validation`).
- Database connections, transactions, CRUD mixins, audit trail, pagination, migrations, factories, seeders (`@framework/database`).
- Auth: sessions, API tokens, email verification, password recovery, TOTP 2FA, JWT/JWK, policies, ownership (`@framework/auth`).
- CRUD layer: `ResourceService`, `ResourceController`, audit + import/export routes, CSV/JSON codec, `DataPorter` (`@framework/crud`).
- Events, realtime hub, queue + batches + failed jobs, scheduler, workflow engine, cache, storage, mail (console/memory), notifications, logging, OpenAPI, testing helpers, support helpers.
- CLI: `create`, `make:crud` (incl. `--verify`), `make:auth`, 16 `make:*` generators, `queue:*`, `db:generate/migrate/status/check/fresh/seed`, `cache:clear`, `storage:check`, `session:prune`, `workflow:*`, `schedule:*`, `build`, `openapi:check`, exit-code + `--json` envelope contracts.
- Deployment: compose, server/worker entry points, `/health/ready`, Dockerfile in generated apps.

**Net-new work the plan must cover:** the Feature Builder (P0-1), programmatic CRUD (P0-2), generator depth (P0-3), kit gap closure (P0-4), SMTP (P0-5), contract/override audit (P0-6), remaining generators (P0-7), resource/transform layer (P0-8), mapping docs (P0-9), plus the P1/P2 items the user confirms in §8.
