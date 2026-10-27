# End-to-End Delivery Plan — Laravel v13 Parity Framework (ORM excluded)

**Author:** Bob (高见远), Architect · **Team:** `software-laravel-framework` · **Language:** English
**Scope of this doc:** the **build/delivery roadmap** — waves, entry/exit gates, CI design, release & versioning, risk register, rollback, and PR conventions.
**Companions (owned by others):** QA test plan → `software-qa-engineer` (Task #4); documentation plan → `software-product-manager` (Task #5).
**Inputs:** `docs/architecture/laravel-parity-architecture.md` (T01–T22 + dependency graph), `docs/requirements/laravel-parity-scope.md`, `docs/status.md`, `docs/architecture/decisions.md`, existing `.github/workflows/ci.yml` + `scripts/{coverage,release}.ts`.

> This plan references task IDs from the architecture doc — it does **not** re-describe the tasks. It also does **not** re-plan finished work (brief §9); the existing 427-test suite and validated phases 0–6 are fixed inputs.

---

## 1. Delivery Waves / Milestones

Six waves (W0–W5) plus an optional W6 lane. Each wave is a merge milestone with a hard exit gate (§2). Rationale: sequence the **critical path first** (feature machinery + kit seam are prerequisites for everything and carry the highest risk), then land breadth in **parallel lanes**, then close with the two verification/communication waves.

| Wave   | Theme                                   | Tasks                                      | Rationale                                                                                                                                                                                  |
| ------ | --------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **W0** | **Foundations**                         | **T01**                                    | Manifests + entry + deps + new-package skeletons + CI scaffold. Nothing compiles or is publishable until this lands; it unblocks every lane.                                               |
| **W1** | **Feature Builder & kit abstraction**   | **T02, T03, T04, T05**                     | Highest-risk, on the critical path. The kit seam (T02) and the Feature Builder (T03→T04) are prerequisites for "composability" and for honest removal. T05 is the verifiable removal gate. |
| **W2** | **One-line CRUD & depth**               | **T06, T07, T08, T09**                     | Delivers the user's headline velocity requirement ("full CRUD in a single line"). Depends only on T01, so it runs **concurrently** with W1.                                                |
| **W3** | **Parity gap closure**                  | **T10, T11, T12, T13, T14, T15, T16, T17** | Closes the PM's `must`/`should` gaps (Gate, Crypt, i18n, Http client, SMTP, SMS, cloud disk, queuekit inspection). Mostly independent; parallel lanes.                                     |
| **W4** | **Delivery surface**                    | **T19, T20**                               | Remaining CLI generators (honesty: zero "planned") + Node runtime adapter (D4/Q7). Independent of W1–W3; parallel.                                                                         |
| **W5** | **Customization audit & documentation** | **T18, T21**                               | The measurable customization gate (one override test per subsystem) and the Laravel-mapping docs. T18 needs W1–W3 landed; T21 needs T03 + T18.                                             |
| **W6** | _(optional)_ **v13 new additions**      | **T22**                                    | P2 opt-ins (JSON:API, passkey, AI SDK, `Collection`/`Str`/`Arr`, `Cache::touch`). Fully parallel; each independently shippable.                                                            |

### 1.1 Parallel lanes per wave

```
W0 ── T01 ─────────────────────────────────────────────────────────────────────
        │
        ├── LANE A (critical): W1 ── T02 → T03 → T04 → T05 ──────────────┐
        │                                                                  │
        ├── LANE B: W2 ── T06 → T07 → { T08 ∥ T09 } ───────────────────┐  │
        │                                                               │  │
        ├── LANE C: W3 ── { T10 ∥ T11 ∥ T12 ∥ T13 ∥ T14 } ─ T15, T16, T17 │
        │                                                               │  │
        ├── LANE D: W4 ── { T19 ∥ T20 } ────────────────────────────────┤  │
        │                                                               │  │
        └── LANE E: W6 ── { T22 tasks } ────────────────────────────────┘  │
                                                                           │
        W5 ── T18 (needs W1–W3 + T05) ── T21 (needs T03 + T18) ◄───────────┘
```

- **Lanes A–E run concurrently after T01.** The only hard serializations are: `T02→T03→T04→T05` (Lane A), `T06→T07→(T08∥T09)` (Lane B), `T02→{T15,T16,T17}` and `T14→T15` (Lane C), and `W5` which gates on `T05`+`T18`.

### 1.2 Critical path

**`T01 → T02 → T03 → T04 → T05 → T18 → T21`** (all P0). Everything else is parallelizable breadth. The single highest-risk node is **T03** (Feature Builder core); schedule an **architect spike** before it starts (validate the resolver's prerequisite/cycle semantics and the `FeaturePlan` shape against the real provider catalog).

### 1.3 Milestone exit = wave exit

A wave is "done" only when its **exit gate (§2)** passes on `main` AND its tasks are merged with green CI (§3). Waves do not overlap in _merge_ order even when their _work_ overlaps in time.

---

## 2. Per-Wave Entry / Exit Criteria (Definition of Done)

Legend: **CMD** = command to run; **EXPECT** = observable result. All commands run from the repo root unless noted.

### W0 — Foundations

- **Entry:** architecture doc approved; `bun install` works on the current tree.
- **Exit (DoD):**
  - **CMD** `bun install` → **EXPECT** workspace resolves `@framework/features`, `@framework/kits`, `apps/minimal-feature`.
  - **CMD** `bun run typecheck` → **EXPECT** clean (skeletons compile).
  - **CMD** `bun run test ./packages ./apps` → **EXPECT** existing 427 tests still green.
  - **CMD** `bun run lint` → **EXPECT** clean.
- **Demo/verification:** `bun run cli -- list` still lists the current catalog; `git status` clean after install.

### W1 — Feature Builder & kit abstraction

- **Entry:** W0 green; `@framework/kits` + `@framework/features` skeletons present.
- **Exit (DoD):**
  - **CMD** `bun test packages/kits packages/features` → **EXPECT** registry/resolver/catalog tests green (unknown-feature parse error, missing-prerequisite bootstrap error, cycle error).
  - **CMD** `bun run cli -- feature:list` → **EXPECT** all 18 features with declared/enabled/availability.
  - **CMD** `bun run cli -- feature:remove queue --dry-run` → **EXPECT** exit 3 `FEATURE_IN_USE` while `workflow`/`scheduler` are enabled; the dry run writes nothing.
  - **CMD** `bun run cli -- feature:check` (in `apps/minimal-feature`, features `['http','validation','database']`) → **EXPECT** all **6 invariants** pass: typecheck, build, boot, suite, **zero imports of excluded `@framework/*`**, clean `bun install --frozen-lockfile`.
  - **CMD** full-profile equivalence: `bun run cli -- create .tmp/full && bun run --cwd .tmp/full typecheck` → **EXPECT** output byte-equivalent to today's `create` (assumption A3).
- **Demo/verification:** toggle a feature off in `apps/minimal-feature/bootstrap/features.ts`, run `feature:check`, show zero-import assertion output + frozen-lockfile install success. **QA signs off T05.**

### W2 — One-line CRUD & depth

- **Entry:** W0 green (needs only T01).
- **Exit (DoD):**
  - **CMD** `bun test packages/crud` → **EXPECT** `resource`, `relations`, `transform`, `filter-sort` suites green.
  - **CMD** `bun run cli -- make:crud Product --module products --table products --verify` (in `.tmp/generated`) → **EXPECT** 5 endpoints green against real PostgreSQL; relations/enums/jsonb included; no private-field exposure.
  - **CMD** programmatic parity: a fixture app calling `defineResource(products).schema(...).access('authenticated').crud()` → **EXPECT** the **same 5 routes** as the CLI path, same suite green.
  - **CMD** `bun run cli -- make:crud ... --dry-run` → **EXPECT** byte-neutral (no writes).
- **Demo/verification:** side-by-side CLI vs programmatic route tables (`route:list`) showing identical paths/contracts.

### W3 — Parity gap closure

- **Entry:** W0 green; T02 (for T15/T16/T17) + T14 (for T15) landed.
- **Exit (DoD):**
  - **CMD** `bun test packages/auth packages/support packages/http packages/mail packages/notifications packages/storage packages/queue` → **EXPECT** new suites green (gate, crypt, localization, client, smtp, sms, cloud, inspection).
  - **CMD** real-infra tests: `bun run db:up` then the kit suites → **EXPECT** SMTP round-trip (sandbox/capture), SMS via NotifyKit, cloud disk against **MinIO in compose**, queuekit inspection/retry against real Redis.
  - **CMD** `bun run coverage` → **EXPECT** per-package thresholds hold (no regression).
  - **CMD** `bun run cli -- list` → **EXPECT** no capability-gap commands silently succeeding; unsupported ops exit 3 with a named `CAPABILITY_UNSUPPORTED`.
- **Demo/verification:** `integration:check` shows the five kits with versions + honest capabilities.

### W4 — Delivery surface

- **Entry:** W0 green.
- **Exit (DoD):**
  - **CMD** `bun run cli -- list --json` → **EXPECT** **zero** generators with `status: "planned"`; `make:model/migration/guard/user-provider/mail/notification/command/schedule/integration` + `integration:*` present.
  - **CMD** `bun test packages/cli/tests/generators.test.ts` → **EXPECT** dry-run byte-neutrality + conflict refusal + one typecheck over all generated code.
  - **CMD** `bun run cli -- create .tmp/node-app --runtime node && bun run --cwd .tmp/node-app typecheck && bun run --cwd .tmp/node-app test` → **EXPECT** Node matrix green (Bun remains the default/validated path).
- **Demo/verification:** generate every `make:*` artifact in a scratch app; one `tsc` pass.

### W5 — Customization audit & documentation

- **Entry:** W1–W3 landed; T05 green.
- **Exit (DoD):**
  - **CMD** `bun test packages/*/tests/*.override.test.ts` → **EXPECT** one override test per subsystem green.
  - **CMD** audit script (or `bun run coverage -- --report`) → **EXPECT** `count(subsystems with a contract) == count(subsystems)`; no `any`/`unknown` at contract boundaries.
  - **CMD** `bun run --cwd apps/docs build` → **EXPECT** docs build with the Laravel-mapping + Feature Builder guides.
  - **EXPECT** `docs/architecture/laravel-concept-map.md` covers every P0/P1 subsystem.
- **Demo/verification:** pick one subsystem, swap its binding for an app fake, show its own suite still passes.

### W6 — Optional v13 additions

- **Entry:** W0 green (each item independent).
- **Exit (DoD):** per-item suite green; each is opt-in and must not alter the full-profile default output.

---

## 3. CI Gate Design

### 3.1 Check inventory (what, where, blocking?)

| #   | Check                         | Command                                                                                                              | Where it runs                  | Blocking?                                                  |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| 1   | Typecheck                     | `bun run typecheck`                                                                                                  | `ci.yml` `verify` job          | **Merge-blocking**                                         |
| 2   | Lint                          | `bun run lint` (`biome check .`)                                                                                     | `ci.yml` `verify` job          | **Merge-blocking**                                         |
| 3   | Format check                  | `bun run format` → `biome format --check .` (verify-only)                                                            | `ci.yml` `verify` job          | **Merge-blocking**                                         |
| 4   | Suite                         | `bun run test ./packages ./apps` (Postgres 17 + Redis 7 services)                                                    | `ci.yml` `verify` job          | **Merge-blocking**                                         |
| 5   | Coverage gate                 | `bun run coverage` (per-package line/function thresholds in `scripts/coverage.ts`)                                   | `ci.yml` `verify` job          | **Merge-blocking**                                         |
| 6   | Feature exclusion invariants  | `bun run cli -- feature:check` in `apps/minimal-feature`                                                             | `ci.yml` `feature-gate` job    | **Merge-blocking**                                         |
| 7   | Generated-app gate            | `bun test packages/cli/tests/create-app.test.ts packages/cli/tests/generated-app.test.ts`                            | `ci.yml` `generated-app` job   | **Merge-blocking**                                         |
| 8   | Full-profile byte-equivalence | diff `.tmp/full` (from `create`) vs golden snapshot                                                                  | `ci.yml` `generated-app` job   | **Merge-blocking**                                         |
| 9   | Node runtime matrix           | `create --runtime node` + typecheck + test                                                                           | `ci.yml` `node-matrix` job     | **Merge-blocking** once T20 lands; **advisory** before     |
| 10  | Docs build                    | `bun run --cwd apps/docs build`                                                                                      | `docs.yml` (existing)          | **Merge-blocking** (paths filter)                          |
| 11  | Contract/override audit       | `bun test packages/*/tests/*.override.test.ts` + contract-count assert + **G14** capability-table↔port-report parity | `ci.yml` `audit` job           | **Merge-blocking** (from W5)                               |
| 12  | `integration:check` (kits)    | `bun run cli -- integration:check` with real infra                                                                   | `ci.yml` `kit-integration` job | **Advisory** (nightly / label-gated) — real infra is flaky |

Advisory = reported but non-blocking; flaky real-infra checks move to a **nightly** schedule + a `run-integration` PR label rather than gating every merge.

### 3.1.1 Documentation gates (owned by the PM's plan — additive, not duplicative)

The documentation plan (`docs/requirements/documentation-plan.md`, owned by `software-product-manager`) adds a parallel set of **documentation gates G1–G14**. They do **not** change the blocking/advisory status of gates 1–12 above. Net CI delta:

| Change                                                                        | Detail                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New job **`docs-lint`** (merge-blocking, no services, parallel with `verify`) | G1 link check · G2 code-sample typecheck (`tsc --noEmit -p tsconfig.json`, sample injected as a workspace module) · G5 undocumented-public-export · G6 undocumented-CLI-command · G7 undocumented-error-code · G8 feature/concept coverage (keys on the **frozen** `feature:check` `invariants[].id` enum + the `FeatureName` catalog) · G9 canonical-copy drift · G11 ADR index completeness |
| **+1 step in `generated-app`** (gate 7–8 job)                                 | G3 OpenAPI drift (`openapi:generate` → `git diff --exit-code docs/api/openapi.json`)                                                                                                                                                                                                                                                                                                          |
| **+1 step in `verify`**                                                       | G13 status staleness (`status.md` vs `cli --list --json`)                                                                                                                                                                                                                                                                                                                                     |
| **+1 step in `audit`** (gate 11 job)                                          | **G14** capability-table ↔ port-report parity (`packages/*/tests/capabilities.test.ts`, unit-only, no services)                                                                                                                                                                                                                                                                               |
| **+1 release step**                                                           | G12 quickstart executed verbatim in a clean tree                                                                                                                                                                                                                                                                                                                                              |
| Gate 10 ≡ G4                                                                  | Same check (`bun run --cwd apps/docs build`); G4 adds sidebar-slug + Pagefind assertions. **One job, not two.**                                                                                                                                                                                                                                                                               |

**Branch protection** must require `docs-lint` **in addition to** `verify`, `feature-gate`, `generated-app`, `node-matrix`, `audit` — an unenforced doc gate does not prevent drift. The capability property now has **two guards at different tiers**: G14 (unit, every PR, doc-vs-port) and gate 12 (real infra, nightly, port-vs-provider), with `CAPABILITY_UNSUPPORTED` as the behavioural guarantee that a kit never fakes a capability.

### 3.2 `.github/workflows/ci.yml` job layout

```yaml
name: CI
on: { push: { branches: [main] }, pull_request: { branches: [main] } }
concurrency: { group: ci-$, { { github.ref } }, cancel-in-progress: true }

jobs:
  verify: # 1–5  (existing job, extended) — Postgres + Redis services
    runs-on: ubuntu-latest
    timeout-minutes: 30
    # services: postgres:17, redis:7  (as today)
    steps: [checkout, setup-bun@1.4.2, bun install --frozen-lockfile, typecheck, lint, format --check, coverage] # coverage runs the suite

  feature-gate: # 6   — the removal invariants on the 3-feature fixture
    needs: verify
    runs-on: ubuntu-latest
    steps:
      [
        checkout,
        setup-bun@1.4.2,
        bun install --frozen-lockfile,
        'bun run cli -- feature:check --cwd apps/minimal-feature',
      ]

  generated-app: # 7–8 — create + make:crud + byte-equivalence
    needs: verify
    runs-on: ubuntu-latest
    services: { postgres: postgres:17 }
    steps:
      [
        checkout,
        setup-bun@1.4.2,
        bun install --frozen-lockfile,
        'bun test packages/cli/tests/create-app.test.ts packages/cli/tests/generated-app.test.ts',
        'bun run cli -- create .tmp/full --no-install',
        'git diff --exit-code -- .tmp/full.golden',
      ] # snapshot compare

  node-matrix: # 9   — Bun (primary) + Node (secondary)
    needs: verify
    strategy: { matrix: { runtime: [bun, node] } }
    runs-on: ubuntu-latest
    steps:
      [
        checkout,
        setup-bun@1.4.2,
        setup-node@22,
        bun install --frozen-lockfile,
        'bun run cli -- create .tmp/app --runtime ${{ matrix.runtime }}',
        'bun run --cwd .tmp/app typecheck && bun run --cwd .tmp/app test',
      ]

  audit: # 11  — contract + override gate (from W5)
    needs: [verify, feature-gate]
    runs-on: ubuntu-latest
    services: { postgres: postgres:17, redis: redis:7 }
    steps:
      [
        checkout,
        setup-bun@1.4.2,
        bun install --frozen-lockfile,
        "bun test 'packages/*/tests/*.override.test.ts'",
        'bun scripts/contract-audit.ts',
      ] # count(contracts) == count(subsystems)

  kit-integration: # 12  — advisory / nightly, real infra (MinIO + Redis + SMTP capture)
    if: github.event_name == 'schedule' || contains(github.event.pull_request.labels.*.name, 'run-integration')
    runs-on: ubuntu-latest
    steps:
      [
        checkout,
        setup-bun@1.4.2,
        bun install --frozen-lockfile,
        'docker compose -f deployment/compose.yaml up -d --wait',
        'bun run cli -- integration:check',
      ]
```

`docs.yml` (existing) keeps building `apps/docs`. `release.yml` (existing) keeps creating the GitHub Release from `CHANGELOG.md`; it is **extended in §4** for npm publish.

### 3.3 Gate discipline

- Every **merge-blocking** gate must be green on the PR head before merge; branch protection requires `verify`, `feature-gate`, `generated-app`, `node-matrix`, `audit`.
- The **byte-equivalence** check (8) is the guard for assumption A3 (full profile == today's `create`). Any intentional generator-output change must update the golden snapshot **in the same PR** with a rationale.
- Coverage thresholds are **regression guards** (measured baseline minus margin), not whole-tree guarantees (Bun's coverage only sees loaded files — documented limitation).

---

## 4. Release Criteria + Versioning / Publishing

Honors **D4: "support all, Bun is main"** — `@framework/*` publishes to npm and is consumable by **bun / pnpm / npm**, with **Bun as the primary validated runtime** and Node supported-but-secondary (ADR-1, ADR-14).

### 4.1 Versioning & manifest boundaries

- **Semver per package.** Each `@framework/*` carries an explicit `version` and a proper `exports` map:
  ```jsonc
  {
    "name": "@framework/core",
    "version": "0.2.0",
    "type": "module",
    "exports": { ".": { "types": "./src/index.ts", "import": "./src/index.ts" } },
    "dependencies": { "@framework/kits": "workspace:^", "zod": "^4.6.5" },
    "peerDependencies": { "hono": ">=4.13.12" }, // where applicable
  }
  ```
- **Dependency boundaries:**
  - `@framework/core` depends **only** on `@framework/kits` (+ `zod`). Never on `@framework/features` (keeps core dumb — architecture §8.8).
  - `@framework/features` depends on nothing but `@framework/core` types.
  - No subsystem imports a `@mohamedhabibwork/*` kit outside its adapter module (ADR-11, architecture §8.12).
  - Optional peers (`nodemailer`, `@hono/node-server`, storage/notification SDKs) are `peerDependencies` with `peerDependenciesMeta.optional = true`, and stay **external** in `bun build`.
- **Workspace vs published:** internal cross-refs use `workspace:*` in the repo; `bun run release` (or a publish script) rewrites `workspace:*` → the resolved semver range at pack time (`bun publish`/`npm pack` handle this; verify with `--dry-run`).

### 4.2 Release criteria (a version may be cut only when ALL hold)

1. All **merge-blocking** CI gates green on `main` (§3.1).
2. The P0 set is complete for the milestone being released (per wave exit gates §2).
3. `bun run coverage` green; `bun run test` green (existing 427 + new).
4. `feature:check` green on `apps/minimal-feature` (removal invariants proven).
5. Full-profile `create` output byte-equivalent to the golden snapshot.
6. `docs/status.md` reflects every command's real classification (`planned`/`implemented`/`validated`) — zero stale "planned".
7. `CHANGELOG.md` section present for the version (existing `release.ts` requires it).
8. Laravel-mapping docs cover every P0/P1 subsystem (T21).

### 4.3 Publish sequence

Reuse the existing `scripts/release.ts` flow (clean tree → semver bump → CHANGELOG → commit → tag), then **add a publish stage** (currently explicitly NOT done by `release.ts`):

```sh
bun run release -- 0.2.0                 # bump + changelog + commit + tag (existing)
bun run typecheck && bun run coverage     # re-assert gates on the tagged commit
# publish in dependency order (leaves → roots):
bun publish --cwd packages/kits    --access public
bun publish --cwd packages/features --access public
bun publish --cwd packages/core    --access public
bun publish --cwd packages/http    --access public
bun publish --cwd packages/<each subsystem> --access public   # validation, database, crud, auth, cache, queue, storage, events, mail, notifications, scheduler, workflow, openapi, testing, logging, support, ai-mcp, cli
bun publish --cwd packages/cli     --access public
```

- **Order matters:** publish leaf packages before dependents so peer/dep ranges resolve.
- **Dry-run first:** `bun publish --dry-run` on every package to confirm the `exports`/`files` contents.
- `release.yml` gains a `publish` job gated on the `v*` tag + a repo secret (`NPM_TOKEN`), mirroring the existing docs-deploy opt-in pattern (`vars.PUBLISH_ENABLED`).

### 4.4 Removal under both consumption modes

| Mode                          | `package.json` entry                | Removal mechanism                                                                                                                   |
| ----------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Workspace** (`workspace:*`) | `"@framework/queue": "workspace:*"` | `feature:remove queue` drops the entry; `bun install --frozen-lockfile` must still resolve (proves no dangling ref).                |
| **Published npm**             | `"@framework/queue": "^0.2.0"`      | `feature:remove queue` drops the entry + refreshes the lockfile; the dependency-graph assertion proves no reachable import remains. |

`feature:check` runs the **same 6 invariants** in both modes; the manifest editor (T04/T05) handles `workspace:*` and semver ranges uniformly.

---

## 5. Risk Register

| ID  | Risk                                                                                                            | Likelihood | Impact   | Mitigation                                                                                                                                                     | Owner                                    | Early-warning trigger                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------- | ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| R1  | **Feature Builder removal invariants fail** (excluded package still imported transitively; lockfile incoherent) | High       | Critical | Mechanical `feature:check` (6 invariants) on the 3-feature fixture; dependency-graph assertion (not grep); `--frozen-lockfile` in a clean tree                 | software-engineer (T05) + QA sign-off    | `feature:check` red on `apps/minimal-feature`; transitive import detected in the assertion output                    |
| R2  | **Kit capability gaps** force a second implementation (ADR-11 violation)                                        | Medium     | High     | Ports + honest `CAPABILITY_UNSUPPORTED`; gaps closed _through kits_ or kept as a documented direct path; `integration:check` reports capabilities              | software-engineer (T15–T17)              | A subsystem silently succeeds where the kit reports unsupported; capability report disagrees with observed behaviour |
| R3  | **`--prune-sources` deletes user code**                                                                         | Medium     | Critical | Framework-owned path manifest per feature; prune restricted to `packages/<subsystem>/`; dry-run lists every deletion; never touch `app/`/`database/`/`config/` | software-engineer (T05) + QA             | `--prune-sources --dry-run` lists any path outside `packages/<subsystem>/`                                           |
| R4  | **Full-profile regression** (`create` output drifts; assumption A3 broken)                                      | Medium     | High     | Golden snapshot byte-equivalence gate in CI; full profile must reproduce today's output exactly; any change updates the snapshot in the same PR with rationale | software-engineer (T03/T04)              | `git diff --exit-code` on `.tmp/full.golden` fails                                                                   |
| R5  | **Real-infra test flakiness** (Postgres/Redis/MinIO/SMTP)                                                       | High       | Medium   | Kit-integration runs **advisory/nightly** + `run-integration` label, not per-merge; health-check waits in compose; isolated per-run DBs (`fw_test_*`)          | software-qa-engineer + software-engineer | Intermittent `kit-integration` failures on unchanged code                                                            |
| R6  | **Node adapter scope creep** (promoting Node to a validated runtime too early)                                  | Medium     | Medium   | Node is **secondary**; adapter behind a contract; separate test matrix; Bun stays default/validated (ADR-1/ADR-14); Node gate is advisory until T20 exit       | software-engineer (T20)                  | Node-only test failures gating unrelated PRs; matrix job runtime ballooning                                          |
| R7  | **Coverage-gate false confidence** (Bun only sees loaded files)                                                 | Low        | Medium   | Thresholds are regression guards, not whole-tree guarantees (documented); new modules must ship tests to be visible                                            | software-qa-engineer                     | New `src` file invisible to coverage after a green run                                                               |
| R8  | **Feature-plan/`Application` coupling** (core accidentally depending on `@framework/features`)                  | Low        | High     | Hard rule: core depends only on `@framework/kits`; resolution happens in a helper, `Application` takes `providers`; enforced by a dependency-boundary test     | software-engineer (T02/T03)              | `@framework/features` appears in `packages/core/package.json` or core imports it                                     |
| R9  | **Kit version bump ripples** across subsystems                                                                  | Low        | Medium   | Kits behind ports; a bump is a one-file adapter change, proven by an adapter-swap test (brief §4d #6)                                                          | software-engineer                        | A kit upgrade requires edits outside its adapter module                                                              |

---

## 6. Rollback / Safety Strategy

### 6.1 Feature removal rollback

- `feature:remove`/`feature:add` reuse the staged-apply + rollback machinery (`packages/cli/src/generators/plan.ts`): every file is written to a temp sibling then renamed; any failure restores previous content. Manifest + `features.ts` edits are part of the same plan.
- `--dry-run` writes nothing (inspect first). A partially applied removal rolls back to the pre-command state on failure.
- Source pruning (`--prune-sources`) is **staged and reversible** from the same plan (the deleted files' contents are captured for restore); it is never the default.

### 6.2 Migration policy (ADR-9, forward-only)

- Migrations are a **release step**; never run on server/worker boot.
- `db:rollback` stays **planned/forward-only**, formally closed under the new **ADR-15** (migrations forward-only; `db:rollback` closed) — distinct from ADR-9 (migrations are a release step). Reverting a schema change = author a new forward migration; reset a **non-production** target with `db:fresh` (which refuses production without `--force`). `docs/upgrade.md` cites ADR-15 directly.
- Generated CRUD migrations are applied only in the isolated test DB during `make:crud --verify`, dropped in both success and failure paths.

### 6.3 Failed-wave revert

- Each wave is a **merge milestone**; waves do not overlap in merge order. A failed wave is reverted by **reverting its merge commit(s)** (or a feature-flag-free branch revert) — the previous wave's green `main` is the rollback target.
- Because the Feature Builder is additive and the full profile reproduces today's behaviour (A3), reverting W1 leaves a working framework; reverting W2 removes the programmatic CRUD API without touching existing CLI/CRUD paths.
- Branch protection + required gates mean a red wave cannot merge into `main` in the first place — rollback is the exception path.

---

## 7. Branching / Commit Conventions & PR Review Gates

### 7.1 Branching

- **Trunk-based:** short-lived branches off `main`, one per task (`t01-infra`, `t03-feature-resolver`, …). Rebase on `main` before merge; squash-merge.
- Task IDs in the branch name and PR title (`T03: Feature Builder core`). Long-lived branches are avoided so the "waves don't overlap in merge order" rule holds.

### 7.2 Commit convention

- **Conventional Commits** (already assumed by `scripts/release.ts`, which strips the prefix when building the changelog): `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `build:`, `ci:`.
- Scope = the package/task: `feat(features): resolver prerequisite errors`, `test(crud): programmatic one-line parity`.
- One logical change per commit; generated-file churn (golden snapshots) committed alongside its cause.

### 7.3 PR review gates

- **Required reviewers:** at least one `software-engineer` peer; QA review required on T05/T18 and any task touching exclusion/override behaviour; architect review on changes to `@framework/core`, `@framework/kits`, `@framework/features`, or the dependency boundaries.
- **Required checks:** the merge-blocking CI gates (§3.1) + no decrease in the covered-test count.
- **PR must include:** the task ID, the wave, evidence (command + output snippet) for the task's exit criteria, and a note if any golden snapshot changed.
- **Do-not-merge conditions:** red required gates; a new `any`/`unknown` at a contract boundary; a direct kit import outside an adapter; a `@framework/features` import inside `@framework/core`; a new command left in `status: planned` after its task claimed completion.
- **Docs gate:** any user-facing command/behaviour change updates `docs/status.md` and (if relevant) the Laravel-mapping docs in the same PR.

---

## Appendix — Traceability (task → wave → gate)

| Wave | Tasks                                  | Exit gate (§2)                                         | CI gates (§3) |
| ---- | -------------------------------------- | ------------------------------------------------------ | ------------- |
| W0   | T01                                    | install/typecheck/test/lint green                      | 1–5           |
| W1   | T02, T03, T04, T05                     | `feature:check` 6 invariants; full-profile equivalence | 1–8           |
| W2   | T06, T07, T08, T09                     | `make:crud --verify` + programmatic parity             | 1–5, 7–8      |
| W3   | T10, T11, T12, T13, T14, T15, T16, T17 | kit suites + real-infra + coverage                     | 1–5, 12       |
| W4   | T19, T20                               | zero "planned"; Node matrix                            | 1–5, 9        |
| W5   | T18, T21                               | override audit; docs build                             | 1–5, 10–11    |
| W6   | T22                                    | per-item suite (opt-in)                                | 1–5           |
