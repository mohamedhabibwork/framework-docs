/**
 * Package catalog — the single source of truth for the landing page pills and
 * the package table on /packages/.
 *
 * `status` mirrors docs/status.md:
 *   validated   — covered by automated tests that run in `bun run test`
 *   implemented — works, exercised manually, no dedicated suite
 *   contracts   — published types and DI tokens only; no runtime yet
 *
 * `scripts/check-docs.ts` asserts that every directory in `packages/` has an
 * entry here, so a new package cannot ship undocumented.
 */

export type PackageStatus = 'validated' | 'implemented' | 'contracts';

export interface PackageEntry {
  /** Directory name and short label (`core`, `ai-mcp`, …). */
  readonly name: string;
  /** Published package name. */
  readonly id: string;
  /** One sentence: what problem it solves. */
  readonly summary: string;
  readonly status: PackageStatus;
  /** Guide page that documents it, when one exists. */
  readonly guide?: string;
}

export const packages: readonly PackageEntry[] = [
  {
    name: 'core',
    id: '@framework/core',
    summary: 'IoC container, service providers, validated config, lifecycle and execution context.',
    status: 'validated',
  },
  {
    name: 'http',
    id: '@framework/http',
    summary: 'Hono kernel: error envelope, request scope, middleware registry, policies, throttling.',
    status: 'validated',
    guide: '/platform/',
  },
  {
    name: 'validation',
    id: '@framework/validation',
    summary: 'Zod request validation and form requests with authorization hooks.',
    status: 'validated',
    guide: '/modules/',
  },
  {
    name: 'database',
    id: '@framework/database',
    summary: 'PostgreSQL connection, transactions, Drizzle CRUD mixins, audit trail, migrations.',
    status: 'validated',
    guide: '/platform/',
  },
  {
    name: 'crud',
    id: '@framework/crud',
    summary: 'Generic resource service/controller, audit endpoints, queued CSV/JSON import-export.',
    status: 'validated',
    guide: '/modules/',
  },
  {
    name: 'auth',
    id: '@framework/auth',
    summary: 'Sessions, API tokens, password hashing, email verification, TOTP, JWT guards.',
    status: 'validated',
    guide: '/authentication/',
  },
  {
    name: 'events',
    id: '@framework/events',
    summary: 'Typed event bus (in-memory or Redis pub/sub) and a WebSocket realtime hub.',
    status: 'validated',
    guide: '/platform/',
  },
  {
    name: 'queue',
    id: '@framework/queue',
    summary: 'BullMQ jobs: validated payloads, idempotency, priority, queue options, batches, drain.',
    status: 'validated',
    guide: '/queues/',
  },
  {
    name: 'scheduler',
    id: '@framework/scheduler',
    summary: 'Cron registry with distributed overlap locking that dispatches jobs or workflows.',
    status: 'validated',
    guide: '/scheduling/',
  },
  {
    name: 'workflow',
    id: '@framework/workflow',
    summary: 'Durable multi-stage workflows with retries, saga compensation and wait-for-event.',
    status: 'validated',
    guide: '/workflows/',
  },
  {
    name: 'cache',
    id: '@framework/cache',
    summary: 'Memory/Redis cache with tags, stale-while-revalidate, batches, locks and rate limiting.',
    status: 'validated',
    guide: '/cache/',
  },
  {
    name: 'storage',
    id: '@framework/storage',
    summary: 'Disk abstraction over local and cloud storage with per-operation options and path guards.',
    status: 'validated',
    guide: '/storage/',
  },
  {
    name: 'mail',
    id: '@framework/mail',
    summary: 'Typed mailable builder, transport contract, console and in-memory test transports.',
    status: 'validated',
    guide: '/mail/',
  },
  {
    name: 'notifications',
    id: '@framework/notifications',
    summary: 'Multi-channel notifications with per-provider options, per-channel native overrides and queued delivery.',
    status: 'validated',
    guide: '/notifications/',
  },
  {
    name: 'logging',
    id: '@framework/logging',
    summary: 'Structured, context-enriched logs with redaction and swappable sinks.',
    status: 'validated',
    guide: '/logging/',
  },
  {
    name: 'search',
    id: '@framework/search',
    summary: 'Full-text search with memory and PostgreSQL drivers, plus queue-backed indexing.',
    status: 'validated',
    guide: '/search/',
  },
  {
    name: 'oauth-server',
    id: '@framework/oauth-server',
    summary: 'OAuth 2.0 / OIDC authorization server: authorization code + PKCE, introspection, revocation.',
    status: 'validated',
    guide: '/oauth-server/',
  },
  {
    name: 'openapi',
    id: '@framework/openapi',
    summary: 'OpenAPI 3.1 generation from route metadata and a route/operation drift check.',
    status: 'validated',
    guide: '/platform/',
  },
  {
    name: 'testing',
    id: '@framework/testing',
    summary: 'Isolated per-run PostgreSQL databases, transaction sandboxes and HTTP test helpers.',
    status: 'validated',
    guide: '/testing/',
  },
  {
    name: 'support',
    id: '@framework/support',
    summary: 'Laravel-style helpers: config, env, abort, logger, retry and context accessors.',
    status: 'validated',
    guide: '/helpers/',
  },
  {
    name: 'cli',
    id: '@framework/cli',
    summary: 'Command runtime, registry and the generators behind `create` and `make:*`.',
    status: 'validated',
    guide: '/cli-reference/',
  },
  {
    name: 'prompts',
    id: '@framework/prompts',
    summary: 'Terminal prompts, spinners, tables and structured output used by the CLI.',
    status: 'validated',
  },
  {
    name: 'ai-mcp',
    id: '@framework/ai-mcp',
    summary: 'stdio MCP server exposing the CLI as tools and the repository docs as resources.',
    status: 'implemented',
    guide: '/ai/',
  },
  {
    name: 'observatory',
    id: '@framework/observatory',
    summary: 'Contracts for in-app request/query/job/event inspection (Telescope equivalent).',
    status: 'contracts',
  },
  {
    name: 'socialite',
    id: '@framework/socialite',
    summary: 'Contracts for OAuth2 social login providers reusing the framework identity model.',
    status: 'contracts',
  },
];

/** Short labels used by the landing strip. */
export const packageNames = packages.map((entry) => entry.name);
