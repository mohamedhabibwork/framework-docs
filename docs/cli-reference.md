# CLI Reference

Every application exposes the same CLI through its own `bin/cli.ts`
(`bun run cli -- <command>` from the app directory, or
`bun run cli -- create …` from the workspace root). The CLI never guesses the
project from the shell's working directory — the project root comes from the
application's own adapter.

## Shared options

| Option              | Effect                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `--help`, `-h`      | Usage, arguments, options, examples, capability requirements                                         |
| `--version`, `-V`   | CLI and framework versions                                                                           |
| `--cwd <path>`      | Explicit project root                                                                                |
| `--env-file <path>` | Explicit environment file (process env still wins)                                                   |
| `--json`            | Machine-readable envelope on stdout: `{ command, status, data, warnings }`; diagnostics go to stderr |
| `--no-interaction`  | Disable prompts; missing required input is an error                                                  |
| `--verbose`         | Additional diagnostics (secrets redacted)                                                            |

Exit codes: `0` success · `1` execution failure · `2` invalid usage ·
`3` unsupported capability · `130` interrupted.
Add `--json` to any command for stable output. Run `bun run cli -- list` for
the live catalog with planned/implemented/validated status.

## Project

### `create <directory>`

Generate a complete application into an empty directory.

| Option                                         | Effect                                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `--with-demo`                                  | Also generate a sample `products` module (files + migration) via `make:crud` inside the new app |
| `--no-install`                                 | Skip dependency installation (also skips `--with-demo`)                                         |
| `--template`, `--runtime`, `--package-manager` | Only `api` / `bun` / `bun` are validated                                                        |

```sh
bun run cli -- create apps/inventory-api --with-demo
```

Generated apps are workspace members: `@framework/*` resolves through the
framework workspace after a root `bun install` (run automatically unless
`--no-install`).

### `help [command]`, `list [--json]`

Command help and the full catalog (including planned commands).

### `config:check`, `config:show [key]`

Validate configuration without starting anything; show resolved
configuration with secrets redacted.

```sh
bun run cli -- config:show database.url
```

### `doctor [--connections]`

Configuration validation plus optional database connectivity probe.

### `route:list [--method <m>] [--path <fragment>] [--json]`

The registered route table (method, path, handler count). Boots binding
registration only — no connections are opened.

### `module:list`, `middleware:list`

Registered providers, middleware aliases and groups.

### `serve [--host] [--port]`, `dev [--host] [--port]`

Production server; `dev` adds the Bun hot-reload watcher. Both delegate to
the app's entry points and forward interrupts.

## Generators

### `make:crud <Resource>`

The one-command CRUD feature. Generates the Drizzle table (new resources),
Drizzle–Zod schemas, DTOs, form requests, repository (mixins), service,
controller, policy, typed native Hono routes, OpenAPI operations, fixtures,
an endpoint test suite — and registers everything via explicit markers.

| Option                            | Effect                                                                                                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--module <name>`                 | Destination module (default: resource plural)                                                                                                                                                                                            |
| `--fields '<spec>'`               | New table: `name:type:required\|nullable\|default=<literal>, …` (types: text, integer, numeric, boolean, uuid, timestamp)                                                                                                                |
| `--table <export>`                | Reuse an existing Drizzle table export (mutually exclusive with `--fields`)                                                                                                                                                              |
| `--schema-file <path>`            | Where `--table` is exported (default: schema index)                                                                                                                                                                                      |
| `--definition <path>`             | JSON resource definition for enums/relations/exposure/fixtures                                                                                                                                                                           |
| `--route <path>`                  | Mount path (default `/api/v1/<module>`)                                                                                                                                                                                                  |
| `--access public\|authenticated`  | Required. `authenticated` wraps every route in `requireAuth()`, emits an ability-checking policy (`<resource>.<ability>` token abilities, `*` for sessions) and generates 401/403 endpoint cases. Requires the auth module (`make:auth`) |
| `--soft-delete`                   | Adds `deletedAt` + restore behavior and deletion tests                                                                                                                                                                                   |
| `--verify`                        | Typecheck + run the endpoint suite on an isolated PostgreSQL database                                                                                                                                                                    |
| `--test-mode in-process\|network` | Endpoint transport for verification (default in-process)                                                                                                                                                                                 |
| `--dry-run`                       | Preview every file change and the test plan; write nothing                                                                                                                                                                               |
| `--force`                         | Overwrite generator-owned files of this module only                                                                                                                                                                                      |

```sh
bun run cli -- make:crud Category \
  --fields 'title:text:required,position:integer:default=0,budget:numeric:nullable' \
  --access public --soft-delete --verify
```

Every endpoint is tested against a real database (never a mock): create →
list → read → update → read → delete → missing-read, plus malformed input,
forbidden fields, allowlist exposure and pagination bounds. `make:crud`
refuses to invent columns, overwrite unrelated files, or collide routes.

### `make:module <name> --crud <Resource>`

Delegates to the same `make:crud` pipeline with an explicit module name.

### Single-artifact generators

`make:schema`, `make:repository`, `make:dto`, `make:request`, `make:response`,
`make:service`, `make:controller` and `make:policy` render **one** artifact of
the `make:crud` pipeline each, through the same renderers — output is
byte-identical to a whole-module generation.

| Option                                      | Applies to           | Effect                                                                    |
| ------------------------------------------- | -------------------- | ------------------------------------------------------------------------- |
| `--module <name>`                           | all slices           | Destination module (default: resource plural)                             |
| `--table <export>`                          | table-coupled slices | Drizzle table export (default: plural camel of the resource)              |
| `--schema-file <path>`                      | table-coupled slices | Where `--table` is exported (default: schema index)                       |
| `--soft-delete`                             | `make:schema`        | Table carries `deletedAt` (string mode)                                   |
| `--fields '<spec>'` / `--definition <path>` | `make:schema`        | New-table fields, same grammar as `make:crud`                             |
| `--kind create\|update\|list`               | `make:request`       | Which operation (default create)                                          |
| `--access public\|authenticated`            | `make:policy`        | Declared resource access (required; `authenticated` requires `make:auth`) |
| `--dry-run` / `--force`                     | all                  | As in `make:crud`                                                         |

Table-coupled slices introspect the Drizzle export and refuse with actionable
hints when a sibling artifact they import is missing (`make:schema` starts a
table-first module; `make:crud` remains the whole-module path).

### Runtime scaffolds

`make:middleware`, `make:provider`, `make:event`, `make:listener` and
`make:test` generate standalone, typecheckable scaffolds and register them
through the app's markers: `make:middleware` aliases into
`bootstrap/middleware.ts` (`@framework:middleware`), `make:provider` into
`bootstrap/providers.ts`, `make:listener` into the `app/listeners` registry
(`@framework:listeners`, subscribed by the listeners provider at boot — pass
`--channel`). `make:test --api` scaffolds an endpoint test through the
generated `tests/support.ts`. All support `--dry-run` and `--force`.

### `make:auth`

Installs session + personal API token authentication: the `app/modules/auth`
module (provider + routes), the framework `users`/`sessions`/`api_tokens`
tables (schema re-export + migration), the config `auth` section, the
`@framework/auth` dependency (runs `bun install` through the enclosing
workspace), provider registration, the kernel guard (`resolveActor:
authActorResolver(application)`) and the `/api/v1/auth` route mount — all via
explicit markers/anchors, previewable with `--dry-run`.

| Option            | Effect                                                                  |
| ----------------- | ----------------------------------------------------------------------- |
| `--guards <list>` | Enabled guards, comma separated: `session`, `api-token` (default: both) |
| `--dry-run`       | Preview file changes, install and migration plan; write nothing         |
| `--force`         | Overwrite generator-owned files of the auth module only                 |

```sh
bun run cli -- make:auth
bun run cli -- db:migrate
```

Afterwards: `POST /auth/register` and `/auth/login` issue an httpOnly session
cookie (CSRF-protected); `POST /auth/tokens` issues a Bearer token
(`fw_pat_…`, shown once, ability-scoped, revocable). Guarded resources use
`requireAuth()`, `requireAbility('<resource>.<ability>')` or
`authenticatedPolicy` from `@framework/auth` / `@framework/http`.

## Database

| Command                            | Effect                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `db:generate --name <name>`        | Diff the schema with pinned Drizzle Kit (offline); review the SQL afterwards |
| `db:migrate [--connection <name>]` | Apply pending migrations under a lock                                        |
| `db:status [--json]`               | Applied/pending migration state                                              |
| `db:check`                         | Validate migration metadata                                                  |

Migrations are never applied automatically on startup — applying them is an
explicit release step.

## Queues

| Command                                           | Effect                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| `queue:work [--queue <name>] [--concurrency <n>]` | Consume the queue in the foreground; SIGTERM/SIGINT drains gracefully |
| `queue:status [--queue <name>] [--json]`          | Job counts per state (waiting/active/completed/failed/delayed)        |

Both require a reachable Redis (`config redis.url`).

## Cache, storage and sessions

Infrastructure commands run only when their provider is registered: the CLI
reads the providers file (`bootstrap/providers.ts`) as text — the same check
`make:crud --access authenticated` applies to `authProvider` — and exits with
code 3 (`UNSUPPORTED_CAPABILITY`) when `cacheProvider`, `storageProvider` or
`authProvider` is missing. Destructive operations additionally require
`--confirm`; `--dry-run` writes nothing.

| Command                                                | Effect                                                 |
| ------------------------------------------------------ | ------------------------------------------------------ |
| `cache:clear [--store <name>] [--dry-run] [--confirm]` | Delete every cached entry in the application namespace |
| `session:prune [--dry-run] [--confirm]`                | Remove expired sessions; `--dry-run` only counts them  |
| `storage:check`                                        | Validate disk configuration (read-only)                |

`cache:clear` requires `@framework/cache` with `createCacheProvider(...)`
registered. `--store` only accepts the provider's single default namespace.
Redis engines deliberately cannot clear a namespace, so execution fails with
the catalogued `CACHE_UNSUPPORTED_OPERATION` error (exit 1) — delete known
keys instead. The project adapter must also expose a `cache(config)` hook
that opens the `CACHE` binding and returns `{ driver, clear, close }`;
without it the command reports the missing capability.

`session:prune` requires the auth module (`make:auth`) plus a
`sessions(config)` adapter hook that opens `PgSessionStore` on the database
connection. `--dry-run` uses `countExpired()` — a read that never deletes —
while `--confirm` runs `prune()` and reports the number of rows removed.

`storage:check` requires `@framework/storage` with `createStorageProvider(...)`
registered. It prints one row per configured disk (driver, visibility, root,
public base URL) and validates the provider's rules: `storage.default` must
name an existing disk and public disks must declare `publicBaseUrl`. Local
roots are probed read-only — they must exist and be writable, or be creatable
from a writable ancestor; kit-backed cloud drivers get only their
framework-owned fields validated (the `options` bag is storagekit's contract).
With `--json` the per-disk rows come back as `{ disks: [...] }`.

## Workflows

| Command                                                                   | Effect                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `workflow:list [--workflow <name>] [--status <s>] [--limit <n>] [--json]` | Paginated runs with workflow, status, correlation and start time                |
| `workflow:status <id-or-prefix> [--json]`                                 | One run with its full node tree (pipeline/stage/action paths, attempts, errors) |
| `workflow:retry <id-or-prefix> [--from <node path>]`                      | Re-run a failed/compensated run from its failure point                          |
| `workflow:cancel <id-or-prefix>`                                          | Cancel a pending, running or waiting run                                        |
| `workflow:prune [--days <n>]`                                             | Delete terminal runs older than the retention window (default 7)                |

`workflow:list`/`workflow:status`/`workflow:cancel`/`workflow:prune` need
PostgreSQL (`config database.url`); `workflow:retry` additionally needs Redis
to re-enqueue.

## Scheduling

| Command                                        | Effect                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `schedule:list [--json]`                       | Registered BullMQ timetables with their next due run                                                       |
| `schedule:run <name>` / `schedule:test <name>` | Enqueue one fire immediately (the scheduler process resolves the target)                                   |
| `schedule:work [--concurrency <n>]`            | Run the scheduler process: sync timetables, consume due fires from the dedicated `<queue>-schedules` queue |

These require a reachable Redis (`config redis.url`). Fires dispatch mapped
jobs or workflows, which run on the regular workers.

## OpenAPI

| Command                                                | Effect                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `openapi:generate --output <path> [--api-version <v>]` | Emit the OpenAPI 3.1 document for documented operations          |
| `openapi:check`                                        | Validate the document against the live route table (drift check) |

## Application generators

Laravel-style `make:*` scaffolds for the pieces an application owns. All share
the `make:crud` pipeline (`--dry-run` writes nothing, existing files are
conflicts unless `--force`, registries update through `// @framework:*`
markers) and refuse up front when the generated code would import a package
the app does not depend on.

| Command                                                                     | Writes                                                | Notes                                                                                                                                                             |
| --------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `make:mail <name>`                                                          | `app/mail/<name>.mail.ts`                             | Typed data → subject/text/HTML (interpolations HTML-escaped) and a `send<Name>Mail(mailer, to, data)` helper. Needs `@framework/mail`                             |
| `make:notification <name> [--channels email,database,push,messaging]`       | `app/notifications/<name>.notification.ts`            | `defineNotification` with one builder per declared channel (default `email,database`). Needs `@framework/notifications`                                           |
| `make:command <name> [--signature group:name]`                              | `app/commands/<name>.command.ts`                      | Registered in `app/commands/index.ts` (created on first use) and appended to the catalog in `bin/cli.ts` (default signature `app:<name>`; existing names refused) |
| `make:schedule <name> (--job <job> \| --workflow <name>) [--cron "<expr>"]` | `app/schedules/<name>.schedule.ts`                    | Registered under `@framework:schedules`; `--job` must exist (`make:job`); cron is validated as five fields (default hourly). Needs `@framework/scheduler`         |
| `make:guard <name> [--header x-api-key]`                                    | `app/auth/guards/<name>.guard.ts`                     | `ActorResolver` reading one credential header; compose it in the kernel's `resolveActor`                                                                          |
| `make:user-provider <name>`                                                 | `app/auth/<name>.user-provider.ts`                    | `UserProvider` decorating `DatabaseUserProvider`; bind as `USER_PROVIDER`. Needs `@framework/auth`                                                                |
| `make:migration <name>`                                                     | `database/migrations/NNNN_<name>.sql` + journal entry | Empty custom SQL migration via the pinned `drizzle-kit generate --custom`                                                                                         |

## Tooling (delegated)

`typecheck`, `test [--filter]`, `lint [--fix]`, `format [--check]` run the
project-configured executables (`tsc`, `bun test`, `biome`). The CLI never
re-implements compilers or formatters.

## Planned commands

The remaining specification catalog (`make:model` — the ORM layer is out of
scope, `make:integration`, `db:rollback` — forward-only by decision,
`cache:prune`, `storage:link`, `storage:prune`, `integration:*`) is listed by
`list` with status `planned` and exits with code 3 when invoked. See
[status.md](status.md) for the delivery phases that introduce them.
