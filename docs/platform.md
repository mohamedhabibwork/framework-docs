# Platform Guide

The runtime services every module shares: request context, errors,
pagination/filtering/sorting, audit, events & realtime, queues and
import/export.

## Request context (Controller → Service → Repository)

One immutable `ExecutionContext` per scope (request, job, command) carries
**who** is acting and **how** work correlates:

```ts
class ExecutionContext {
  readonly kind: ScopeKind; // 'request' | 'job' | 'command' | 'test'
  readonly correlationId: string; // request id / job correlation
  readonly actor: Actor; // { id, type: user|service|system|anonymous }
  withActor(actor: Actor): ExecutionContext; // e.g. after authentication
}
```

The HTTP kernel creates a scope per request and disposes it after the
response; the queue worker does the same per job with the dispatcher's
identity. Repositories receive a `DataContext`:

```ts
interface DataContext {
  readonly transactions: TransactionContext; // transaction propagation
  readonly execution: ExecutionContext; // actor + correlation for audit/events
}
```

Nothing recreates or mutates the context on the way down — audit rows and
events are attributed to the same actor/correlation id from controller to
SQL. Authentication plugs in via the kernel's `ActorResolver`.

## Errors

Every failure is an `HttpError` with a stable catalog code; clients switch on
`code`, never message text:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Product not found",
    "requestId": "8d1c…",
    "details": {}
  }
}
```

Helpers: `notFound()`, `badRequest()`, `conflict()`, `forbidden()`,
`unauthenticated()`, `validationFailed(fields)`, `tooManyRequests()`,
`serviceUnavailable()`. Unknown exceptions become a redacted `500
INTERNAL_ERROR` (details only when `exposeInternalErrors` is on).

| Code                                                      | Status |     | Code                     | Status |
| --------------------------------------------------------- | ------ | --- | ------------------------ | ------ |
| `BAD_REQUEST` / `MALFORMED_JSON`                          | 400    |     | `PAYLOAD_TOO_LARGE`      | 413    |
| `UNAUTHENTICATED`                                         | 401    |     | `UNSUPPORTED_MEDIA_TYPE` | 415    |
| `FORBIDDEN`                                               | 403    |     | `VALIDATION_FAILED`      | 422    |
| `NOT_FOUND` / `ROUTE_NOT_FOUND`                           | 404    |     | `TOO_MANY_REQUESTS`      | 429    |
| `METHOD_NOT_ALLOWED`                                      | 405    |     | `INTERNAL_ERROR`         | 500    |
| `CONFLICT` / `UNIQUE_VIOLATION` / `FOREIGN_KEY_VIOLATION` | 409    |     | `SERVICE_UNAVAILABLE`    | 503    |

Validation failures include field-level errors:

```json
{
  "error": { "code": "VALIDATION_FAILED", "fields": [{ "path": "name", "message": "too_small", "code": "too_small" }] }
}
```

## Pagination, filtering, sorting

List queries use a bounded schema (out-of-range values fail with 422, never
clamp):

```json
// GET /api/v1/products?page=2&limit=20
{
  "items": [/* … */],
  "meta": { "page": 2, "limit": 20, "total": 100, "totalPages": 5 }
}
```

Services add typed filters and sorts via `QueryOptions`:

```ts
import { and, gte, ilike } from 'drizzle-orm';

const page = await repository.paginate(
  { page: 1, limit: 20 },
  {
    filters: [ilike(products.name, `%${q}%`), gte(products.price, minPrice)],
    sort: [{ column: products.price, direction: 'desc' }], // `id` always sorts last
  },
);
```

Pagination is deterministic (requested sort first, `id` tiebreaker) and
`repository.batches(size)` iterates by keyset for large exports.

## Audit

Repositories composed with `Auditable(Base, 'products')` write every
create/update/delete/restore/import into the framework-owned `audit_logs`
table **in the same transaction** as the change, with field-level diffs and
before/after snapshots (`options.auditExclude` removes secrets).

Query the trail over HTTP:

```sh
curl 'localhost:3000/audit?resource=products&resourceId=<id>&limit=20'  # one entity
curl 'localhost:3000/audit?actorId=user-1'                              # one user
curl 'localhost:3000/audit?correlationId=<request-id>'                  # one request, everywhere
curl 'localhost:3000/audit/<auditId>'                                   # one entry
```

Programmatic access: `AuditReader` (`AUDIT_READER` scoped binding) with
`page(request, filters)` and `findById(id)`. The `/audit` endpoints are
denied in production until an authorization layer exists (the generated
`bootstrap/http.ts` shows the extension point).

## Events & realtime

A single `EventBus` contract with two drivers:

- `MemoryEventBus` — default; single process, development/tests.
- `RedisEventBus` — `EVENTS_DRIVER=redis`; namespaced pub/sub with a
  dedicated subscriber connection and payload validation for cross-instance
  fan-out.

Domain events carry `{ id, type, channel, payload, correlationId, actor,
occurredAt }`. Services publish `entity.created|updated|deleted|restored`
after commit; import/export publish `import.*` / `export.*` progress events.

Subscribe in code:

```ts
await bus.subscribe('products', (event) => console.log(event.type, event.payload));
```

Or push to browsers via the generated `GET /ws` endpoint (protocol):

```json
→ {"action":"subscribe","channel":"products"}
← {"type":"subscribed","channel":"products"}
← {"type":"event","event":{ "type":"products.created", "payload":{ … } }}
→ {"action":"ping"}   ← {"type":"pong"}
→ {"action":"unsubscribe","channel":"products"}
```

Channels are allowlisted when the gateway is configured, with optional
per-connection authorization and subscription limits. `Bun.serve({
websocket })` wiring is included in the generated server entry point.

### WebSocket gateway (`/ws`)

Generated applications and the playground serve a `WebsocketGateway` at
`/ws` on top of that bus:

- **Connection authentication** — `authenticate(c)` resolves the request
  scope's actor (anonymous until the auth phase); returning null refuses the
  socket with `4001`.
- **Private user channels** — every authenticated actor is auto-subscribed to
  `user.<id>`; server code pushes with `gateway.toUser(id, verb, payload, execution)`.
- **Channel authorization** — `authorize(c, channel, actor)` per join,
  on top of the allowlist.
- **Presence** — joining/leaving a tracked channel broadcasts
  `presence.joined` / `presence.left`; `gateway.online(channel)` lists who
  is currently subscribed.

```ts
// bootstrap/http.ts (generated)
application.container.resolve(WEBSOCKET_GATEWAY).routes();

// server-side push from anywhere with a scope
const gateway = scope.resolve(WEBSOCKET_GATEWAY);
await gateway.toUser(order.ownerId, 'order.shipped', { orderId }, scope.resolve(EXECUTION_CONTEXT));
```

## Queues (BullMQ + Redis)

Define versioned, validated, idempotent jobs:

```ts
import { defineJob } from '@framework/queue';

export const resizeImage = defineJob({
  name: 'images.resize',
  version: 1,
  payload: z.object({ imageId: z.string().uuid() }),
  attempts: 3, // exponential backoff (default 1s)
  timeoutMs: 60_000,
  idempotencyKey: (p) => `resize-${p.imageId}`, // duplicate dispatches collapse
  async handle(payload, ctx) {
    await ctx.progress(50); // reported to BullMQ
    return { resized: payload.imageId };
  },
});
```

Register it in `app/jobs/index.ts`, dispatch from anywhere with a scope:

```ts
const queue = scope.resolve(QUEUE);
await queue.dispatch(resizeImage, { imageId }, scope.resolve(EXECUTION_CONTEXT));
await queue.status(jobId); // state, progress, attempts, result, failedReason
```

The worker (`bun run worker` or `queue:work`) runs each job in a fresh scope
carrying the dispatcher's actor/correlation id, enforces per-job timeouts,
and drains gracefully on SIGTERM/SIGINT. Payloads are validated before
enqueue _and_ before execution; unknown job names or version mismatches fail
without retrying. `queue:status` shows counts per state.

### Batches

Fan out many jobs as one unit with batch bookkeeping in Redis:

```ts
const { batchId, jobIds } = await queue.dispatchBatch(resizeImage, payloads, execution, {
  onComplete: { name: 'images.batch-done', version: 1, payload: { batchId, total: payloads.length } },
});
await queue.batchStatus(batchId); // running | completed | partially-failed | cancelled + counters
await queue.batchFailures(batchId); // the failed jobs, for inspection/replay
await queue.cancelBatch(batchId); // remaining jobs fail fast as unrecoverable
```

Counters move with atomic `HINCRBY`/`HSETNX` bookkeeping, so concurrent
workers cannot lose updates, and the completion job fires exactly once.
Retried jobs count once toward the batch (only terminal failures do).

## Workflows (Pipeline → Stage → Action)

`@framework/workflow` adds durable multi-step executions: Postgres persistence
(`workflow_runs` + a `workflow_nodes` execution tree), BullMQ as transport,
checkpoint/resume at every node, and saga compensation. The composition is
Workflow → Pipeline → Stage → Action:

```ts
import { defineAction, defineStage, defineWorkflow, parallel } from '@framework/workflow';
import { z } from 'zod/v4';

const chargeCard = defineAction({
  name: 'charge-card',
  via: 'queue', // run as its own BullMQ job (default 'inline')
  input: z.object({ orderId: z.string() }), // zod-validates the state slice
  attempts: 3,
  precheck: (state) => {
    if (!state.reserved) throw new Error('not reserved');
  },
  run: (input) => ({ chargeId: `ch_${input.orderId}` }),
  compensate: (state) => refund(state.chargeId), // runs newest-first on failure
});

export const orderFulfillment = defineWorkflow({
  name: 'order-fulfillment',
  version: 1,
  input: z.object({ orderId: z.string() }), // seeds the run state
  onFailure: 'compensate', // or 'halt'
  stages: [
    defineStage({ name: 'stock', actions: [reserveStock] }),
    defineStage({ name: 'fulfill', actions: parallel([chargeCard, createShipment]) }),
    defineStage({ name: 'notify', actions: [notify], when: (s) => Boolean(s.chargeId) }),
  ],
});
```

Stages are the checkpoint boundaries; they may gate with `precheck`, compose
`actions` (sequential, or `parallel()` groups) or a default `run`, and park
the whole run with `waitFor: { event: 'payment.succeeded', timeoutMs }` — a
bridge on the event bus resumes the run when the event arrives (a sweep fails
expired waits). Every transition is a conditional database update, so
re-delivered jobs, crashes and concurrent workers converge instead of
double-executing.

Register definitions in a provider (`manager.register(...workflows)`), then
dispatch from anywhere:

```ts
const { runId } = await manager.dispatch(orderFulfillment, { orderId }, execution);
const status = await manager.status(runId); // run + full node tree
await manager.cancel(runId); // or retry(runId, { fromNode }), resume(runId), prune(days)
```

**Workers**: merge the engine's internal jobs into the regular `JobWorker` —
one process, one queue:

```ts
const engine = new WorkflowEngine(application, manager, queue, bus);
const worker = new JobWorker(queue, application, [...jobs, ...engine.jobs], { concurrency: 4 });
worker.start();
engine.start(); // wait-for-event bridge + timeout sweep
```

Actions marked `via: 'queue'` and queued stages execute as their own BullMQ
jobs (scaling horizontally for free); everything else runs inline inside the
parent unit. Progress events publish on the aggregate `workflow` channel and
the per-run `workflow.run.<runId>` channel — subscribe over `/ws` for live
updates.

**HTTP** (`workflowRoutes()`, mounted at `/admin/workflows` in the
playground, outside the documented `/api` prefix like `/health`): `GET /`
(paginated runs), `GET /:runId` (run + node tree), `POST
/:runId/retry|cancel|resume`, `POST /dispatch`. Unprotected until Phase
3 auth; pass an `authorize` hook when guards land.

**CLI**: `workflow:list`, `workflow:status <id-prefix>`, `workflow:retry
<id> [--from <node path>]`, `workflow:cancel <id>`, `workflow:prune --days <n>`.

## Scheduling (cron)

`@framework/scheduler` registers cron timetables on BullMQ job schedulers and
turns due fires into dispatched jobs or workflows:

```ts
import { defineSchedule } from '@framework/scheduler';

export const nightlySummary = defineSchedule({
  name: 'orders-nightly-summary',
  cron: '0 3 * * *',
  timezone: 'Europe/Berlin',
  overlap: 'skip', // Redis lock until the next due run
  dispatch: { kind: 'workflow', workflow: 'order-fulfillment', input: () => ({ orderId: 'nightly' }) },
});
```

The scheduler process (`bin/scheduler.ts`, `schedule:work`) syncs the
timetables and consumes fires on a dedicated `<queue>-schedules` queue —
regular workers never see them. `schedule:list` shows timetables and their
next due run; `schedule:run`/`schedule:test <name>` fire immediately.

## Import / export

Long-running data moves run as queued jobs via `@framework/crud`:

```ts
const importJob = defineImportJob({
  resource: 'products',
  repository: PRODUCT_REPOSITORY,
  rowSchema: createProductSchema, // every row validated
  columns: ['name', 'price'], // strict CSV header
  batchSize: 100, // one transaction per batch: partial success
});

const exportJob = defineExportJob({
  resource: 'products',
  repository: PRODUCT_REPOSITORY,
  columns: ['id', 'name', 'price'],
  serialize: toProductResponse,
  store, // ExportStore (LocalExportStore ships built-in)
});
```

Wire them into a `DataPorter` and mount `importExportRoutes`:

| Endpoint                                   | Purpose                                                      |
| ------------------------------------------ | ------------------------------------------------------------ |
| `POST /api/v1/data/import`                 | `{ resource, format: csv\|json, content }` → `202 { jobId }` |
| `GET  /api/v1/data/import/status/:jobId`   | State, row counts, per-row errors                            |
| `POST /api/v1/data/export`                 | `{ resource, format: csv\|json }` → `202 { jobId }`          |
| `GET  /api/v1/data/export/status/:jobId`   | Progress (`export.progress` events on the bus)               |
| `GET  /api/v1/data/export/download/:jobId` | The finished artifact (streamed attachment)                  |

**These endpoints are OpenAPI-documented**: add
`...dataOperations({ mount: '/api/v1/data', resources: ['products'] })` to
your operations list (the generated app ships it) — with `resources` set, the
documented request schemas enumerate the configured resources, so clients see
exactly what can be imported/exported. The OpenAPI drift check
(`openapi:check`) fails if the routes and documentation ever diverge.

Imports report partial success (valid rows commit in batches; invalid rows
are listed with row numbers); exports stream keyset batches into the
artifact with bounded memory. XLSX/PDF formats and a shared (multi-node)
export store are planned.

## Health

`GET /health/live` never touches dependencies (liveness).
`GET /health/ready` pings PostgreSQL and returns
`{ status: 'ready' | 'unavailable', checks: { database: 'ok' | 'failed' } }`
with 503 when not ready — wire it to your orchestrator's readiness probe.
