# Scheduling

Recurring work — nightly digests, cleanup sweeps, report generation — belongs
on a timetable, not in a request. `@framework/scheduler` registers cron
schedules on the queue: BullMQ owns the timetable, the framework owns
dispatch, and every due fire becomes a normal [job](queues.md) or
[workflow](workflows.md) executed by your regular workers.

The design is deliberately boring: a dedicated scheduler process syncs your
definitions onto the queue and consumes only the due fires, so several
scheduler processes can run side by side without double-dispatching.

## Setup

Declare schedules in `app/schedules/index.ts`:

```ts
import { defineSchedule } from '@framework/scheduler';

export const schedules = [
  defineSchedule({
    name: 'orders-nightly-summary',
    cron: '0 3 * * *', // 03:00 every day
    timezone: 'Europe/Berlin',
    overlap: 'skip', // default: never run two at once
    dispatch: {
      kind: 'workflow',
      workflow: 'order-fulfillment',
      input: () => ({ orderId: `nightly-${new Date().toISOString().slice(0, 10)}` }),
    },
  }),
] as const;
```

The scheduler process (`bin/scheduler.ts` in generated apps) syncs the
timetables and consumes the fires. Fires run on their own
`{queue}-schedules` queue — BullMQ forbids colons in queue names, and this
keeps regular workers from ever seeing them:

```ts
const queue = new QueueManager({
  url: config.redis.url,
  prefix: config.queue.prefix,
  queue: `${config.queue.name}-schedules`,
});
await runScheduler({
  application,
  queue,
  schedules,
  dispatchWorkflow: (name, input, execution) =>
    application.container.resolve(WORKFLOW_MANAGER).dispatch(name, input, execution),
});
```

`runScheduler` syncs the timetables, consumes their fires and drains on
SIGTERM/SIGINT. Use `Scheduler` and `JobWorker` directly to manage the lifecycle
yourself.

Syncing is idempotent — it creates or updates each BullMQ job scheduler, so
redeploying with a changed cron expression simply re-registers the timetable.

## Dispatch targets

A schedule dispatches either a registered job (with an optional payload
builder receiving the fire time) or a registered workflow by name:

```ts
defineSchedule({
  name: 'hourly-metrics',
  cron: '17 * * * *', // quarter past every hour
  dispatch: {
    kind: 'job',
    job: collectMetrics,
    payload: (now) => ({ window: now.toISOString() }),
  },
});
```

Laravel-style recipes, expressed as plain cron:

| Cadence                 | Cron          |
| ----------------------- | ------------- |
| Every five minutes      | `*/5 * * * *` |
| Hourly at :17           | `17 * * * *`  |
| Daily at 08:00          | `0 8 * * *`   |
| Nightly at 03:00        | `0 3 * * *`   |
| Weekly, Sunday midnight | `0 0 * * 0`   |
| First day of the month  | `0 0 1 * *`   |

## What a fire looks like

BullMQ fires the timetable, not your handler: each due run enqueues one
internal `__schedule.fire` job on the dedicated queue — a proper job
envelope with the system actor and correlation id `schedule:{name}`. The
worker consumes it through `scheduler.fireJob(schedules)`, which resolves
the named definition and dispatches its target with the fire's execution
context. An unknown name fails with `SCHEDULE_UNKNOWN`, and a fire holds a
60-second timeout with a single attempt — retries belong to the target job
or workflow, not to the timetable.

Retiring a schedule is symmetric with registering it:

```ts
await scheduler.desync('orders-nightly-summary'); // removes timetable and lock
```

## Overlap and idempotency

With `overlap: 'skip'` (the default) each fire takes a Redis lock
(`SET NX EX`) that is held until roughly the next due run, so a slow run can
never overlap its successor — even across scheduler processes. With
`overlap: 'replace'` fires proceed unconditionally and late runs simply
supersede earlier ones.

Fire dispatch is idempotent too: the dispatched job gets the id
`schedule-{name}-{fireId}`, so a redelivered fire collapses into the job it
already created instead of duplicating work. The lock TTL is capped at one
hour and bounded by the timetable itself, so a stuck lock cannot outlive its
schedule.

## Running and inspecting

```bash
bun run cli -- schedule:list              # registered timetables and next due run
bun run cli -- schedule:work              # run the scheduler process in the foreground
bun run cli -- schedule:work --concurrency 4
```

In production the scheduler process runs alongside the worker (see
[Deployment](deployment.md)); `schedule:work` is its CLI front door. Fire
handlers default to concurrency 1 — schedules dispatch work, they do little
of their own — and `--concurrency` raises it only if your targets resolve
slowly before dispatching.

## Testing

Fire a schedule immediately and watch the wiring end to end — fire, scheduler
process, and the dispatched job or workflow run on the worker:

```bash
bun run cli -- schedule:test orders-nightly-summary
bun run cli -- workflow:list --workflow order-fulfillment
```

`schedule:test` is an alias of `schedule:run` with a test correlation id, so
the resulting audit rows are easy to pick out. The framework's scheduler
suite runs against real Redis and covers timetable sync, job dispatch,
workflow dispatch through the deps hook, and the overlap lock. For scheduled
user-facing messages, see [Notifications](notifications.md).
