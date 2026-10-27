# AI integration (skills + MCP)

The framework is designed to be operated by AI coding agents. Two integration layers ship
in the repository; both are optional and compose with the plain CLI.

## MCP server — `packages/ai-mcp`

A Model Context Protocol server that exposes the application CLI **in-process** (through
the embeddable `runCli` API, no child process) with the machine-readable `--json` envelope
always enabled, plus the repository documentation as resources.

Registered via [`.mcp.json`](../.mcp.json) (Claude Code / ZCode pick it up automatically) or
run by hand:

```sh
bun run mcp                      # stdio transport
FRAMEWORK_APP_DIR=apps/my-api bun run mcp   # target another generated app
```

| Env                        | Meaning                                                                      | Default           |
| -------------------------- | ---------------------------------------------------------------------------- | ----------------- |
| `FRAMEWORK_APP_DIR`        | App directory whose `bin/cli.ts` is bridged (workspace-relative or absolute) | `apps/playground` |
| `FRAMEWORK_ROOT`           | Workspace root override                                                      | auto-detected     |
| `FRAMEWORK_MCP_TIMEOUT_MS` | Per-invocation timeout                                                       | `120000`          |

### Tools

Structured wrappers (input is validated, `--json --no-interaction` enforced, long-running
processes rejected):

- **Discovery** — `catalog`, `help`, `run_command` (generic passthrough), `doctor`,
  `routes_list`, `modules_list`, `config_check`, `config_show`
- **Scaffolding** — `crud_scaffold` (`make:crud`), `auth_install` (`make:auth`)
- **Database** — `db_status`, `db_generate`, `db_migrate`
- **Runtime** — `queue_status`, `workflow_list`, `workflow_status`, `workflow_retry`,
  `workflow_cancel`, `schedule_list`
- **API surface** — `openapi_generate`, `openapi_check`
- **Checks** — `checks` (typecheck / lint / test / format through the CLI)
- **Docs** — `docs_list`, `docs_read`, `docs_search` (whitelisted repository documents
  only; path traversal is rejected)

Every CLI-backed tool result embeds the CLI exit code and envelope, so agents can
distinguish failure (`1`), invalid usage (`2`) and unsupported capability (`3`) from
success. `serve`, `dev`, `queue:work` and `schedule:work` are refused because they are
processes, not operations.

### Resources

`fwdocs://docs/<file>.md` plus the root guides (`framwork.md`, `folder.md`, `README.md`,
`CHANGELOG.md`, …) — the same set `docs_list`/`docs_read` expose.

### Embedding contract

The bridge requires the app's `bin/cli.ts` to export its `project` adapter and run the CLI
only under `import.meta.main` — the shape the `create` generator emits since this feature
landed. Older generated apps keep working as CLIs; re-scaffold or apply the same two-line
change to bridge them.

## Skills

Project skills live in `.zcode/skills/` (loaded by ZCode from this repository) and are
mirrored by the same content in `docs/`:

| Skill                    | Covers                                                                      |
| ------------------------ | --------------------------------------------------------------------------- |
| `hono-framework`         | Workspace layout, CLI envelope contract, checks, doc map                    |
| `hono-framework-crud`    | `make:crud` field grammar, modes, dry-run → verify workflow, file ownership |
| `hono-framework-auth`    | `make:auth`, guards, abilities, TOTP/recovery/JWT flows, deny-by-default    |
| `hono-framework-testing` | Isolated databases, generated suites, release gate                          |
| `hono-framework-ops`     | Migrations, queues, schedules, workflows, maintenance commands              |

For Claude Code, symlink the folder: `ln -s .zcode/skills .claude/skills`.

## Design rules

1. One operation surface: MCP tools and skills both delegate to the app CLI — no second
   implementation of commands to keep in sync.
2. Machine output everywhere: the `--json` envelope is the contract agents parse; human
   formatting stays on the text path.
3. Safety mirrors the CLI: capability gating (exit 3), `--confirm` for destructive
   maintenance, no auto-migrations, no invented schema columns.
