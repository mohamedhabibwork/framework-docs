# Roadmap to 1.0

The live roadmap from v0.3 to v1.0. It replaces [enhancement-plan.md](enhancement-plan.md),
which stays as the record of M1–M7. Open items carried over from that plan are tagged
"old Mx" below. Last reviewed: 2026-11-01.

**Goal:** a client creates a project with minimal code and can replace any part of
the framework without editing framework code.

## Where we are

The 2026-11-01 audit (evidence in [status.md](status.md)) found:

- A blank generated app is about 25 hand-wired files and about 1,000 lines before
  any business code: `template/bootstrap/*`, 9 provider wrappers, a 162-line
  `config/index.ts`, `bin/*`, and a copied `routes/health.ts`.
- One CRUD table takes 14 files and about 277 lines, and each module must be
  registered in 3 places (`bootstrap/providers.ts`, `routes/api.ts`,
  `bootstrap/openapi.ts`).
- Nothing can be replaced: `Container.bind` throws `DUPLICATE_BINDING`, and
  `createAuthProvider` binds its stores unconditionally.
- Types are lost at API boundaries:
  - `UserRecord` is fixed to the framework `users` table.
  - `resourceRoutes` drops Hono RPC types.
  - Job and notification registries are `any`.
  - Notification channels and guard names are closed unions.
  - `ownedBy` accepts any string.
- Provider list order still matters, for example cache before auth.

## Design principle: two override layers

1. **App-wide types: the augmentable `Register` interface** in `@framework/core`.
   ```ts
   declare module '@framework/core' {
     interface Register {
       user: typeof users.$inferSelect;
       config: AppConfig;
       jobs: typeof jobs;
       notifications: typeof notifications;
       events: AppEvents;
       tenant: Tenant;
       permissions: 'posts.publish' | 'users.manage';
       channels: 'whatsapp';
       guards: 'partner-api';
     }
   }
   ```
   Packages read their defaults from `Register`. Without augmentation, today's
   types remain the defaults.
2. **Local overrides: generics and options on every `define*` / `create*`.**
   At the end of the chain, `container.override(token, factory)` (or
   `defineApp({ overrides })`) replaces any binding, including ones the framework
   owns.

The target minimal app:

```ts
// app.ts
export default defineApp({
  config: defineConfig({ app: appSlice, database: true, cache: true, queue: true, mail: true }),
  modules: [postsModule],
  overrides: [[MAIL_TRANSPORT, smtp()]],
});

// modules/posts.ts
export const postsModule = defineResource(posts, { access: 'authenticated', ownedBy: 'authorId' });

// bin/server.ts
runServer(app);
```

## Milestones

| #   | Milestone                              | Depends on | Size |
| --- | -------------------------------------- | ---------- | ---- |
| M8  | App foundation (DX core)               | —          | L    |
| M9  | Generic resources and typed registries | M8         | L    |
| M10 | Missing drivers and contract-only pkgs | M8         | M    |
| M11 | New packages                           | M9         | XL   |
| M12 | Production readiness                   | M8         | M    |

### M8 — App foundation

1. **Container overrides.**
   - Add `override(token, factory)`, `extend(token, decorate)` and `bindDefault`.
   - An app override wins no matter what order bindings are registered in.
2. **Typed providers.**
   - Providers declare `provides` and `requires`.
   - Boot order is topological.
   - A missing or circular requirement fails at boot.
3. **`Register` augmentation.**
   - Add the interface and its helper types.
   - Type the `CONFIG` token.
   - Make the `config()` helper path-typed.
4. **`defineConfig`.**
   - Composes package config slices.
   - Each slice declares its own env keys, so the env mapping is generated.
5. **`defineApp` with presets.**
   - The `api` preset installs database, cache, queue, events, logging and mail.
   - Add the runners `runServer`, `runWorker`, `runScheduler` and `runCli`.
   - `@framework/http` owns the `/health` and `/health/ready` routes.
6. **`defineModule`.**
   - Bundles a module's providers, routes, OpenAPI, jobs, listeners, schedules
     and seeders.
   - A module registers in one place.
7. **Template rewrite.** Move `create`, `template/`, `apps/playground`, the
   generator markers and the docs onto the new APIs.
   - Gate: a generated app has ≤ 5 files of non-business code.
   - Done: `create`, `template/` and the playground compose in one
     `bootstrap/app.ts` on `defineApp`, `bin/server.ts` uses `runServer`, and
     `make:crud` / `make:auth` register there (`paths.app`). Five wiring files
     are gone. Their `config/index.ts` uses `defineConfig`, with no
     hand-written env mapping.
     `bin/worker.ts` uses `runWorker`, and the playground's `bin/scheduler.ts`
     uses `runScheduler`.
     `apiPreset` (`@framework/presets`) absorbs the nine provider wrappers.
     `apiPreset` also takes the listeners and data routes, and `apiProject`
     (`@framework/presets/cli`) shrinks `bin/cli.ts` from 134 lines to 31.
   - Remaining: the gate is not met. A generated app has 14 TypeScript files
     (down from 25). Of those, `app/jobs`, `app/notifications`, `app/listeners`,
     `database/schema` and `database/seeders` are registries for your own code,
     and two are tests. The wiring left is `bootstrap/app.ts`,
     `bootstrap/middleware.ts`, `config/index.ts`, `drizzle.config.ts` and the
     three `bin/` entry points.

### M9 — Generic resources and typed registries

1. **`defineResource(table, opts)`.**
   - Produces the repository, service, controller, routes, OpenAPI and policy.
   - Every part can be replaced through options.
   - Hono RPC types are preserved.
   - `make:crud` gains `--compact`; today's layout stays as `--expanded`.
   - Done: `defineResource` in `@framework/crud`, proven against PostgreSQL with
     a typed RPC client (`packages/crud/tests/define-resource.test.ts`).
     `make:crud --compact` emits it, and the playground's products module uses
     it, with its e2e and RPC contract tests unchanged.
2. `ownedBy` is limited to `keyof TEntity`, and the service container option is typed.
   - Done: a wrong field no longer compiles on `ResourceService` or `baseService`,
     and `container` takes any `Resolver` without a cast
     (`packages/crud/tests/service-types.test.ts`).
3. Generic repository mixin constructors, with no `as unknown as` overrides.
   - Done: `BaseRepository` and `BaseSoftDeletableRepository` extend one generic
     base each, and their 27 delegating overrides are gone. Hooks and helpers see
     the concrete table (`packages/database/tests/repository-types.test.ts`).
4. **Auth generic over the user type:** `createAuthProvider<TConfig, TUser>({ usersTable, … })`.
   - `Principal<TUser>`.
   - Guard names are extensible.
   - Done: `usersTable`, `userProvider`, `hasher`, `stores` and `guards` options,
     with `Register.user` and `Register.guards` flowing through the DI tokens and
     `c.var.principal.user`. A custom table must be named `users`, because the
     auth tables' foreign keys point there
     (`packages/auth/tests/generic-user.test.ts`).
5. **Typed job, notification and event registries,** checked against `Register`.
   - Notification channels are extensible through `defineChannel`.
   - Done: `queue.dispatch('name', payload, ctx)`, `send` and `sendQueued` are
     checked against `Register.jobs` and `Register.notifications`, and event
     payloads against `Register.events`. `JobList` and
     `AnyNotificationDefinition` no longer use `any`
     (`packages/notifications/tests/registries.test.ts`,
     `packages/events/tests/register.test.ts`).
6. **CRUD depth (old M4):**
   - Relations, with an allowlisted `?include=`.
   - `pgEnum` mapped to `z.enum`.
   - `jsonb` with a schema.
   - Filter/sort DSL in OpenAPI.
   - Done on `defineResource`: `relations` with `belongsTo` and `hasMany`,
     `filterable`, `sortable` and `columns`, and `defineListQuery` for hand-written
     modules (`packages/crud/tests/resource-depth.test.ts`). `make:crud` doesn't
     generate these options yet.

### M10 — Missing drivers and contract-only packages

1. SMTP transport, plus an `SmsTransport` contract with Twilio/Vonage drivers (old M6).
   - Done: `SmtpMailTransport` over nodemailer, proven against a real SMTP server in
     tests, and `smsChannel` with `twilioSms` and `vonageSms`. The SMS drivers are
     tested against a local stand-in for each API, not the live providers.
2. S3, R2 and MinIO storage, validated against MinIO in compose (old M6).
   - Done: the `s3`, `r2` and `minio` drivers pass one disk contract against MinIO in
     compose (`packages/storage/tests/s3-compatible.test.ts`). The storagekit drivers
     needed no changes. `r2` hasn't run against Cloudflare.
3. Streaming XLSX import/export and a pluggable PDF renderer (old M6).
   - Done: `xlsxChunks` and `parseXlsx` in `@framework/crud`, checked against another
     implementation (`packages/crud/tests/xlsx.test.ts`), and the `PdfRenderer` contract.
     Export streams to `LocalExportStore`. Import stays in memory, bounded, because the
     content travels in the job payload.
4. **`@framework/socialite` runtime.**
   - Google, GitHub and Apple drivers, plus `defineSocialDriver`.
   - Account linking to the generic user.
   - Done: all of it, in `@framework/socialite`, with the `socialite:providers` command
     (`packages/socialite/tests/socialite.test.ts`). The drivers have only run against
     a stand-in for each provider.
5. **`@framework/observatory` runtime.**
   - Watchers backed by a Postgres store, with a protected JSON API.
   - Covers the `observatory:*` commands.
   - Done: request, exception, query, job, mail and event watchers, with
     `packages/observatory/tests/observatory.test.ts`. No cache watcher yet.

### M11 — New packages

Every new package follows the same pattern:

- Generic contracts.
- A `Register` key.
- A `create<X>Provider`.
- Drivers selected by config, including a memory driver for tests.
- A `make:*` generator, a guide page and a status row.

1. **`@framework/authorization`.**
   - `defineAbility<TSubject, TActor>`, with `can` / `authorize`.
   - Roles and permissions typed by `Register['permissions']`.
   - Config-backed and DB-backed stores.
   - Done: gate, abilities, config and PostgreSQL stores, `permissionPolicy`, `make:ability`
     and `permission:sync` (`packages/authorization/tests/authorization.test.ts`). The
     package is a plain directory until it has its own repository.
2. **`@framework/tenancy`.**
   - Subdomain, header, path and custom resolvers.
   - Row-scoped or schema-per-tenant data.
   - Tenant-prefixed cache, queue, storage and search keys.
   - `tenant:*` commands.
   - Partly done: resolvers, row scoping, per-tenant schemas and `tenantKey`
     (`packages/tenancy/tests/tenancy.test.ts`). Still open: `tenant:*` commands, migrating
     tenant schemas, a `make:*` generator, and cache, queue and storage applying keys themselves.
3. **`@framework/flags` and `@framework/settings`.**
   - Typed flags that resolve global → tenant → user, with percentage rollout.
   - A typed runtime settings store.
4. **`@framework/i18n`.**
   - Typed message keys and locale middleware.
   - `t()` in the request scope.
   - Localized validation and notifications.
5. **`@framework/billing`.**
   - Stripe and Paddle drivers.
   - A `Billable` mixin.
   - Subscriptions, plans and trials.
   - Signed, idempotent webhooks that emit typed events.

### M12 — Production readiness

1. OpenTelemetry traces from HTTP through service, repository and job, plus metrics (old M7).
2. `/health/ready` with per-package checks registered through `defineHealthCheck`.
3. `idempotency` middleware keyed on `Idempotency-Key`.
4. An ADR on the Node runtime.
5. Release gates:
   - A clean-room `create` smoke test in CI.
   - A CI check that every CLI command has a status row.
   - Publishing the split repos.
   - The `bun create owner/repo` path.

## Sequencing

```text
M8 ─> M9 ─┬─> M11.1 authorization ─> M11.2 tenancy ─> M11.5 billing
          └─> M11.3 flags/settings, M11.4 i18n (parallel)
M10 and M12 run in parallel after M8
```

## First pull requests

1. `feat(core)`: container `override`, `extend` and `bindDefault`.
2. `feat(core)`: provider `provides` / `requires` with topological boot order.
3. `feat(core)`: the `Register` interface, a typed `CONFIG` and the path-typed `config()`.
4. `feat(core)`: `defineConfig` with env metadata per slice.
5. `feat(http)`: health and readiness routes and the process runners.
6. `feat(core)`: `defineApp` with presets, and `defineModule`.
7. `refactor(template)`: `create`, `template/` and the playground on the new APIs.

## Rules per item

- TDD against real Postgres and Redis where touched. Type-level tests
  (`@ts-expect-error`) cover every generic or augmentation claim.
- No `unknown`/`any` in public types (`JsonValue`/`ServiceValue` discipline).
- Update [status.md](status.md) and `CHANGELOG.md` in the same PR. Use
  conventional commits and keep to one sub-item per PR.
