# Deployment

Processes, configuration, migrations and operational behavior for running a
generated application.

## Processes

| Process      | Command                                           | Purpose                                                                                                                           |
| ------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| HTTP server  | `bun run start` (or `bun run cli -- serve`)       | Serves the API, health, audit and realtime endpoints                                                                              |
| Queue worker | `bun run worker` (or `bun run cli -- queue:work`) | Consumes BullMQ jobs **and** workflow unit/advance jobs; run separately from HTTP                                                 |
| Scheduler    | `bun run cli -- schedule:work`                    | Syncs cron timetables and consumes schedule fires from the dedicated `<queue>-schedules` queue, dispatching mapped jobs/workflows |
| Migrations   | `bun run cli -- db:migrate`                       | Release step — never automatic on startup                                                                                         |
| CLI          | `bun run cli -- <command>`                        | Generators, inspections, maintenance                                                                                              |

Development uses `bun run dev` (hot reload). Each process handles
SIGTERM/SIGINT with a bounded graceful drain (`SHUTDOWN_TIMEOUT_MS`): the
server stops accepting connections and the worker finishes in-flight jobs
before exiting. Workers scale horizontally for both jobs and workflows
(queued workflow actions are ordinary BullMQ jobs; run state is in Postgres,
so any worker can pick up any node).

## Configuration

All configuration is validated at boot (fail fast) and frozen afterwards.
Precedence: process environment > `.env` file > schema defaults. Secrets are
redacted in logs, diagnostics and CLI output.

| Variable                                            | Default                            | Purpose                                    |
| --------------------------------------------------- | ---------------------------------- | ------------------------------------------ |
| `APP_NAME` / `APP_ENV` / `APP_DEBUG`                | app name / `development` / `false` | Identity, environment, verbose errors      |
| `HTTP_HOST` / `HTTP_PORT`                           | `127.0.0.1` / `3000`               | Bind address                               |
| `CORS_ORIGINS`                                      | empty                              | Comma-separated allowed origins (API only) |
| `HTTP_MAX_BODY_BYTES`                               | `1048576`                          | Request body limit (413 beyond)            |
| `SHUTDOWN_TIMEOUT_MS`                               | `10000`                            | Graceful drain deadline                    |
| `DATABASE_URL`                                      | required                           | PostgreSQL connection string               |
| `DATABASE_MAX_CONNECTIONS`                          | `10`                               | Pool size                                  |
| `REDIS_URL`                                         | `redis://127.0.0.1:6379`           | Queue backend (and Redis event driver)     |
| `QUEUE_NAME` / `QUEUE_CONCURRENCY` / `QUEUE_PREFIX` | `default` / `4` / app name         | Worker tuning and Redis key namespace      |
| `EVENTS_DRIVER`                                     | `memory`                           | `redis` for cross-instance event fan-out   |

## Migrations as a release step

```sh
bun run cli -- db:generate --name add-orders   # diff schema → review the SQL by hand
bun run cli -- db:migrate                      # apply under a lock (explicit, logged)
bun run cli -- db:status                       # verify applied/pending state
```

1. Change tables in `database/schema/` (or let `make:crud` do it).
2. `db:generate` — review the generated SQL like any other code change.
3. Deploy, then run `db:migrate` **before** (or as part of) the release —
   servers never migrate themselves on boot.

## Local infrastructure

Each generated app ships `deployment/compose.yaml` (PostgreSQL 17 + Redis 7
with healthchecks, loopback-only ports):

```sh
docker compose -f deployment/compose.yaml up -d --wait
```

## Health and monitoring

- `GET /health/live` — liveness, no dependencies; restart the container when it fails.
- `GET /health/ready` — readiness with a database check (503 when not ready); use as the orchestrator's readiness probe.
- `bun run cli -- queue:status` — queue depth per state; alert on a growing `failed` count.
- Structured logs carry request/correlation ids; secrets and credentials are redacted before output.

## Scaling notes

- **HTTP**: stateless — scale horizontally behind a load balancer.
- **Worker**: run one or more; BullMQ coordinates via Redis. Tune
  `QUEUE_CONCURRENCY` per instance.
- **Events**: set `EVENTS_DRIVER=redis` when running more than one instance
  so `entity.*` / `import.*` / `export.*` events fan out to every node's
  WebSocket clients.
- **Export artifacts**: the built-in `LocalExportStore` writes to local
  disk; multi-node deployments need a shared store (swap the `ExportStore`
  implementation).
- **Audit endpoints** are denied in production by the generated bootstrap
  until an identity/authorization layer is in place — extend the
  `authorize` hook when auth lands.

## Checklist

```sh
bun run cli -- config:check      # validated configuration
bun run cli -- doctor --connections
bun run test                     # full suite incl. real-PostgreSQL/Redis gates
bun run cli -- db:migrate        # release step
bun run start & bun run worker   # server + worker
```
