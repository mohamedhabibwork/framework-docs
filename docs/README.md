# Documentation

This directory is the **canonical source** for the framework's documentation.
The Starlight site in [`apps/docs`](../apps/docs) is generated from it, and the
MCP server serves these files as resources — so an edit here reaches GitHub, the
docs site and AI agents at once.

## Map

| Document                                                                                        | Read it when you want to…                                             |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [Getting started](getting-started.md)                                                           | go from an empty machine to a running, tested API                     |
| [CLI reference](cli-reference.md)                                                               | look up a command, option, exit code or generator                     |
| [Authoring modules](modules.md)                                                                 | add a feature: schemas, repository, service, controller, routes       |
| [Platform guide](platform.md)                                                                   | understand the kernel: context, errors, pagination, audit, events     |
| [Helpers](helpers.md)                                                                           | use `config()`, `env()`, `abort()`, `logger()`, `retry()`             |
| [Authentication](authentication.md)                                                             | add sessions, tokens, verification, TOTP or JWT guards                |
| [Errors and codes](errors.md)                                                                   | interpret or produce an error response                                |
| [Cache](cache.md) · [Storage](storage.md) · [Mail](mail.md) · [Notifications](notifications.md) | wire a subsystem                                                      |
| [Search](search.md)                                                                             | index tables and query them                                           |
| [Queues](queues.md) · [Workflows](workflows.md) · [Scheduling](scheduling.md)                   | run work outside the request                                          |
| [OAuth server](oauth-server.md)                                                                 | let other applications obtain tokens for your API                     |
| [Authorization](authorization.md)                                                               | decide what a principal may do, with roles, permissions and abilities |
| [Tenancy](tenancy.md)                                                                           | serve several customers from one app and keep their data apart        |
| [Social login](socialite.md)                                                                    | sign users in through Google, GitHub, Apple or your own provider      |
| [Observatory](observatory.md)                                                                   | inspect requests, queries, jobs, events, mail and errors              |
| [Testing](testing.md)                                                                           | write endpoint suites and run the release gates                       |
| [Deployment](deployment.md)                                                                     | ship: processes, config, migrations, scaling                          |
| [AI integration](ai.md)                                                                         | drive the framework from a coding agent                               |
| [Packages](packages.md)                                                                         | see what each package does and whether it is ready                    |
| [Implementation status](status.md)                                                              | check what is validated, implemented or planned                       |
| [Architecture decisions](architecture/decisions.md)                                             | understand why a choice was made                                      |

Specification and planning documents (not user guides):
[framwork.md](../framwork.md) (the specification), [folder.md](../folder.md)
(layout rules), [roadmap-v1.md](roadmap-v1.md) (open work to 1.0),
[enhancement-plan.md](enhancement-plan.md) (the delivered M1–M7 plan),
[architecture/](architecture/) (ADRs, diagrams, delivery plans),
[requirements/](requirements/) (scope), [testing/](testing/) (test plans),
[documentation-upgrade.md](documentation-upgrade.md) (the latest documentation and
UI audit, with the open gaps).

## Reading paths

**"I want a working API in ten minutes."**
[Getting started](getting-started.md) → [CLI reference](cli-reference.md#generators) →
[Authoring modules](modules.md).

**"I want to add a feature to an existing app."**
[Authoring modules](modules.md) → `make:crud` in the
[CLI reference](cli-reference.md#makecrud-resource) → [Testing](testing.md).

**"I am taking this to production."**
[Authentication](authentication.md) → [Platform guide](platform.md#audit-trail) →
[Deployment](deployment.md) → [Implementation status](status.md) (known limits).

**"I am contributing to the framework."**
[folder.md](../folder.md) → [Architecture decisions](architecture/decisions.md) →
[Testing](testing.md) → [status.md](status.md) (evidence per phase).

## Conventions

- **One H1 per page, in the frontmatter.** The `.md` files start with `# Title`
  because GitHub needs it; the generated `.mdx` drops that line and lets
  Starlight render the frontmatter `title`. Two competing `<h1>`s are a bug.
- **Sentence case headings.** "Getting started", not "Getting Started".
- **Links between pages are relative and point at `.md`.** The sync step
  rewrites them to site routes (`platform.md` → `/platform/`).
- **Code fences carry a language.** `sh` for shell, `ts` for TypeScript,
  `json` for payloads, `text` for trees.
- **Every page ends with `## Related`.** It is how readers (and agents) move
  sideways.
- **Claims carry evidence.** If a page says "validated", the suite that proves
  it should be named — or the claim belongs in [status.md](status.md).

## Working on the docs

```sh
bun run docs:dev      # Starlight dev server (apps/docs)
bun run docs:sync     # regenerate apps/docs/src/content/docs/*.mdx from docs/*.md
bun run docs:check    # frontmatter, H1, sidebar coverage, links, md/mdx parity
bun run docs:build    # static build to apps/docs/dist
```

`docs:check` is the guard rail: it fails when a page is missing frontmatter,
has a duplicate H1, is not reachable from the sidebar, links to a page that does
not exist, or when a `.mdx` no longer matches its `.md` source.

### Adding a page

1. Write `docs/<slug>.md` (H1, intro, body, `## Related`).
2. Add the slug, `title` and `description` to `PAGE_META` in
   [`apps/docs/scripts/sync-docs.ts`](../apps/docs/scripts/sync-docs.ts).
3. Add it to the right group in [`apps/docs/src/data/sidebar.ts`](../apps/docs/src/data/sidebar.ts).
4. `bun run docs:sync && bun run docs:check && bun run docs:build`.

Archived docs lines (`apps/docs/src/content/docs/v01/`) are frozen snapshots
written by the release script — never edit them by hand.
