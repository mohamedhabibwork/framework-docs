# Framework Enhancement Plan

Derived from [status.md](status.md) (2026-10-04: 301 tests passing, typecheck + lint clean). Every item closes a documented gap: a "planned" CLI command, a "Known limitation", or deferred phase scope. Each item ships with the existing gate standard: an automated test against real infrastructure, its status.md row moved to **Validated**, and docs.

Delivery status (2026-10-27): **M1, M2, M3 delivered** — every planned
`make:*` generator now ships except `make:model` (ORM out of scope) and
`make:integration`, alongside `integration:*`; `db:rollback` stays planned by
the forward-only ADR; **M5** delivered except the Node-runtime ADR; **M7**
items 2–4 delivered (route blind spot fixed, per-status OpenAPI error schemas,
per-package coverage gate) with tracing/metrics still planned; **M4** and
**M6** remain open.

## Priorities

| #   | Milestone                          | Why now                                                              | Size |
| --- | ---------------------------------- | -------------------------------------------------------------------- | ---- |
| M1  | Security hardening                 | Unprotected admin routes block production use                        | M    |
| M2  | Auth completion (Phase 3 deferred) | Recovery/verification/OTP/JWT are table stakes                       | L    |
| M3  | Database & CLI lifecycle           | `db:seed/rollback/fresh` + `make:*` are the daily DX loop            | L    |
| M4  | CRUD generator depth               | Relations/enums/JSON/ownership are the most common hand-written code | L    |
| M5  | Multi-node & deployment            | Local export store, no Dockerfile                                    | M    |
| M6  | Drivers & formats                  | SMTP, SMS, cloud storage, XLSX/PDF                                   | M    |
| M7  | Observability & DX polish          | Tracing/metrics, route-detection edge case                           | S–M  |

## M1 — Security hardening (first)

1. Secure-by-default `workflowRoutes()`, `auditRoutes`, `importExportRoutes`: require `authorize` at mount time (explicit `'public'` to opt out).
2. Generic `throttle` middleware alias over the cache `RateLimiter` (not only login).
3. Config-driven `secureHeaders` + `cors` in the kernel with strict defaults.
4. Gate: 401/403 tests on every admin route family; security review of `http`, `auth`, `workflow`, `crud`.

## M2 — Auth completion

1. Email verification: signed, expiring, single-use, hashed-at-rest tokens; `verified` middleware.
2. Password recovery: no user enumeration, constant-time responses, revoke all sessions on reset, delivered via `@framework/notifications`.
3. OTP / 2FA: TOTP (RFC 6238) + recovery codes; two-step login when enabled.
4. JWT/JWK guard: JWKS rotation, `kid` lookup, aud/iss checks, plugged into `resolveActor`.
5. Ownership policies: `ownedBy('userId')` helper + row scoping in `ResourceService`.
6. `make:auth --features verification,recovery,otp,jwt`.

## M3 — Database & CLI lifecycle

1. `db:rollback` / `db:fresh` with production-target guards (reuse `@framework/testing` guards).
2. `db:seed` with `defineSeeder` + `defineFactory`, shared with tests.
3. ✅ `make:*` generators on one shared template/conflict/dry-run pipeline from `make:crud`: `job`, `seeder`, `factory`, the CRUD slices, `middleware`, `provider`, `event`, `listener`, `test`, and (2026-10-27) `mail`, `notification`, `command`, `schedule`, `guard`, `user-provider`, `migration`.
4. Remaining `queue:*` (`failed`, `retry`, `flush`, `pause`, `resume`) — backend exists on `QueueManager`.
5. `build`: `bun build --compile` for server/worker/scheduler.
6. Gate: generate → typecheck → app suite green, per generator.

## M4 — CRUD generator depth

1. Relations from Drizzle FKs (`belongsTo`/`hasMany`, allowlisted `?include=`), FK fixtures in generated tests.
2. `pgEnum` → `z.enum`; `jsonb` via `--json-schema`.
3. Composite / non-`id` primary keys in repository mixins.
4. `--owned-by userId` row-scoped generation (needs M2.5).
5. Validated filter/sort DSL (`?filter[field][op]=`, `?sort=`) documented in OpenAPI.

## M5 — Multi-node & deployment

1. `ExportStore` over `@framework/storage` disks replacing `LocalExportStore` in multi-node configs.
2. Multi-stage Bun Dockerfile; compose services `server`/`worker`/`scheduler` with healthchecks.
3. `/health/ready` checking DB, Redis, queue.
4. Node runtime: decide via ADR (support or document Bun-only).

## M6 — Drivers & formats

1. SMTP transport (replace `SMTP_PLANNED`), queued by default.
2. SMS notification channel behind a `SmsTransport` contract.
3. `s3`/`r2`/`minio` storage validated against MinIO in compose.
4. Streaming XLSX import/export; pluggable PDF export renderer.

## M7 — Observability & DX

1. OpenTelemetry traces HTTP → service → repository → job via `ExecutionContext`; metrics for latency, queue depth, job duration.
2. Fix consecutive-duplicate-route blind spot (`packages/http/src/routing/routes.ts`).
3. Per-status OpenAPI error schemas from `ERROR_CATALOG`.
4. CI check: every CLI command has a status.md row; ≥80% coverage per package.

## Sequencing

```
M1 ─┬─> M2 ──┐
    └─> M3 ──┴─> M4
M5, M6, M7 in parallel after M1
```

## Rules per item

- TDD against real Postgres/Redis where touched.
- No `unknown` in public types (`JsonValue`/`ServiceValue` discipline).
- Update `status.md` + `CHANGELOG.md` in the same PR; conventional commits; one sub-item per PR.

## Open decisions

- JWT library (`jose` recommended); JWT alongside or replacing API tokens.
- Down-migrations vs forward-only + `db:fresh`.
- Node runtime in scope or not.
