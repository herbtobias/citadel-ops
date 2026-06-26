# Citadel Ops

[![CI](https://github.com/herbtobias/citadel-ops/actions/workflows/ci.yml/badge.svg)](https://github.com/herbtobias/citadel-ops/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/herbtobias/citadel-ops/graph/badge.svg)](https://codecov.io/gh/herbtobias/citadel-ops)
[![License: BUSL-1.1](https://img.shields.io/badge/license-BUSL--1.1-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-3c873a.svg)](package.json)
[![Nuxt](https://img.shields.io/badge/Nuxt-4-00DC82.svg?logo=nuxt&logoColor=white)](https://nuxt.com)

> **A multi-agent agile-OS for AI agents** — a spy-themed HQ where AI coding agents pull
> **Missions** from **Operations**, work them in their lane, hand off across disciplines, and
> report back. You ("HQ") watch and control everything from a Kanban board.

## The story

It's 03:00 at the Citadel. A **Field-Agent** — a Claude Code session, or any AI agent — reports
for duty. The **M Desk** issues it a **License**: scoped to one discipline (a **Sector** like
`BACKEND`), and revocable the instant HQ wants it gone (the kill-switch).

The agent pulls its **Briefing** from **The Archive** — the project's living memory — and claims
the next ready **Mission** from the active **Operation** (a sprint). No two agents ever grab the
same one: claiming is atomic. For a design task it writes a **Dossier** (problem, plan, affected
files), and a _fresh_ **Recruit** with zero prior context runs the **Cold Read** — if the Recruit
can't restate the plan, it goes back to the drawing board. Only then does work begin.

Our agent only does BACKEND, so when the feature needs tests it can't write, it **hands off** a new
QA Mission — carrying the same Dossier and artifacts forward — to whichever agent works that Sector.
The QA agent finds a bug and hands a _bugfix_ back, linked both ways. To finish anything, an agent
must clear **Q-Branch's Quality Gates** (e.g. "tests must pass" — proven by an attached test report);
half-done work simply can't be marked done.

Every move — every claim, hand-off, gate, and verdict — is written to **The Wire**, an append-only,
hash-chained log you can't quietly rewrite. HQ watches the **Board** move in real time, gets a ping
when a Mission needs review, and can **pause, redirect, or pull a License** at any moment.

## What it's for

Citadel turns "let an AI agent chew through my backlog" into something you can run **with many
agents at once** — or one solo agent wearing several hats — safely and accountably:

- **Bounded parallelism.** Each agent is fenced to its Sector; cross-discipline work becomes an
  explicit, tracked hand-off instead of one agent flailing across the whole codebase.
- **Shared brain, consistent output.** Every agent on a project reads the _same_ Archive, Harness,
  Quality Gates, and Design Guidelines — so parallel agents stay in-style and in-spec.
- **Fresh context per Mission (EGM).** Agents reload only what a Mission needs — cheaper runs, no
  context-rot, and the Cold Read keeps plans genuinely understandable.
- **Gates that actually block.** Bad or unfinished work can't slip to "done"; the harness runs for real.
- **Audit + control.** Tamper-evident history, a kill-switch, control orders, and live notifications
  keep a human firmly in command.
- **Agent-agnostic.** Claude Code is the reference driver, but any MCP- or REST-speaking agent works
  (see [docs/AGENT_INTEGRATION.md](docs/AGENT_INTEGRATION.md)).

### Decoder (codename → what it actually is)

| Codename                      | Plain meaning                                                        |
| ----------------------------- | -------------------------------------------------------------------- |
| **Operation** / **Mission**   | Sprint / Task                                                        |
| **Field-Agent** · **Recruit** | A worker AI agent · a zero-context agent that runs the Cold Read     |
| **Sector**                    | The discipline an agent is licensed for (BACKEND, QA, DESIGN, …)     |
| **The M Desk** / **License**  | Auth authority / the agent's revocable bearer credential             |
| **The Archive**               | Dossiers + knowledge docs — the project's institutional memory (EGM) |
| **Cold Read**                 | Zero-context comprehension gate on a Dossier before work may start   |
| **Q-Branch**                  | Quality Gates, Harness (build/test/lint), and Design Guidelines      |
| **The Wire**                  | Append-only, hash-chained activity log (tamper-evident audit)        |
| **Hand-off**                  | Spawning a new Mission in another Sector with shared context         |
| **HQ**                        | You — the human, via the board                                       |

See the full concept in `~/.claude/plans/neue-app-die-mir-jaunty-shamir.md`.

## Getting started

### Prerequisites

- **Node ≥ 22**
- **Docker** (for Postgres) — or your own Postgres on `:5433`

### 1. Run HQ (the server)

```bash
npm install
docker compose up -d                  # Postgres on :5433
npm run db:push && npm run db:seed    # schema + demo data   (shortcut: task bootstrap)
npm run dev                           # http://localhost:3000
```

Open <http://localhost:3000> and sign in as the SuperAdmin **`hq@citadel.test`** /
**`citadel123`** (more demo logins below).

> Prefer one command? `docker compose --profile full up --build` (or `task stack`) runs the
> whole stack — auto-migrated and seeded — in Docker.

### 2. Put an agent to work — the `/citadel-work` skill

This is the fast path: a Claude Code session becomes a Field-Agent via the **`/citadel-work`
skill** plus the **`citadel` MCP server**. The skill is the loop; the MCP server is how it talks
to HQ; the License is its credential. Set up steps **a–d** once, then just invoke `/citadel-work`.

**a. Make the skill available**

- _Project scope (already done):_ launch Claude Code **inside this repo** —
  `.claude/skills/citadel-work/SKILL.md` is auto-loaded; invoke it with `/citadel-work`.
- _Personal scope (every project):_
  ```bash
  mkdir -p ~/.claude/skills/citadel-work
  cp .claude/skills/citadel-work/SKILL.md ~/.claude/skills/citadel-work/
  ```

**b. Issue a License** — in HQ go to **M Desk → Issue license** (or the **Ops Console**:
`POST /api/v1/projects/:id/licenses`). Pick the agent's sector(s); the key (`lic_…`) is shown
**once** — copy it.

**c. Configure the MCP server**

```bash
cp .mcp.json.example .mcp.json        # .mcp.json is gitignored — your key stays local
```

Edit `.mcp.json` and paste the key into `CITADEL_LICENSE` (set `CITADEL_URL`, default
`http://localhost:3000`):

```json
{
  "mcpServers": {
    "citadel": {
      "command": "npx",
      "args": ["tsx", "mcp/stdio.ts"],
      "env": { "CITADEL_URL": "http://localhost:3000", "CITADEL_LICENSE": "lic_…" }
    }
  }
}
```

**d. Run it**

```bash
npm run dev          # HQ/API must be reachable at CITADEL_URL
claude               # launch from THIS repo; trust the `citadel` MCP server when prompted
```

Invoke **`/citadel-work`**. The agent loops `acquire_license → get_briefing → claim_next →
work → complete → next` — sector-scoped, gate-compliant, fresh context per mission. Watch it
live in HQ on the **Board**, **Situation Room**, and **Admin → Trace Log**.

> No Claude run handy? The CLI driver runs the same loop, and `--dry-run` exercises it without
> invoking Claude:
>
> ```bash
> npm run agent -- --license lic_… --dry-run
> ```

### Use a different agent runtime (agent-agnostic)

Citadel doesn't care which AI drives it — the server holds all the logic and only checks the
License. Claude is just the reference driver. The full runtime-neutral spec is
[docs/AGENT_INTEGRATION.md](docs/AGENT_INTEGRATION.md); the short version:

**Any MCP-capable runtime (e.g. Google Antigravity).** Register Citadel as an MCP server and give
the agent the mission loop as its instructions — no code changes:

- **HTTP** — server URL `http://localhost:3000/api/mcp`, header `Authorization: Bearer lic_…`
- **stdio** — command `node`, args `[".../mcp/stdio.ts"]`, env `CITADEL_URL` + `CITADEL_LICENSE`

**Any other runtime (e.g. a Hermes model in your own harness).** Use the generic driver — Citadel
runs the model-agnostic loop and hands each mission to a command you provide:

```bash
npm run agent -- --license lic_… --driver generic --exec "sh examples/generic-agent.sh"
```

The `--exec` command is spawned once per mission with the mission context, the License, and the MCP
entrypoint in its environment (`CITADEL_MISSION_*`, `CITADEL_LICENSE`, `CITADEL_MCP_STDIO`); it does
the work and finishes the mission via the citadel tools. Orchestration stays Citadel's, the brain
is yours. [`examples/generic-agent.sh`](examples/generic-agent.sh) is a working (non-Claude) stub.

### Demo logins (password `citadel123`)

| Email                    | Role                       |
| ------------------------ | -------------------------- |
| `hq@citadel.test`        | SuperAdmin (all orgs)      |
| `manager@citadel.test`   | Manager (all org projects) |
| `agent.dev@citadel.test` | Contributor (WEB only)     |
| `observer@citadel.test`  | Viewer (WEB, read-only)    |

### Demo agent licenses (Bearer keys, WEB project)

`lic_007_demo` (007, BACKEND) · `lic_009_demo` (009, QA) · `lic_006_demo` (006, FRONTEND/DESIGN).
Agent loop endpoints: `POST /api/v1/agent/check-in` → `claim-next` → `…/missions/:id/heartbeat`
→ `…/hand-off` → `…/complete`; `GET /api/v1/agent/orders` for control.

## Status

**P0 — Scaffold** ✓ Nuxt 4 + Tailwind v4 frontend, multi-theme foundation, app-shell +
Kanban board; Drizzle/Postgres, docker-compose, Taskfile, seed.

**P1 — Data model & Core API** ✓ Full Drizzle schema (§8) + migrations; Mission state-machine;
core CRUD (`/api/v1` projects/operations/missions + transition); The Wire (hash-chained
activity log); Pinia stores wired to `$fetch` — the board now renders from Postgres.

**P2 — Organizations, Teams & Permissions** ✓ Session auth (login/register/logout, scrypt);
permission tiers SuperAdmin / Manager / Contributor / Viewer with **row-level isolation**
(contributor sees only granted projects, viewer is read-only); email-invite flow (create +
accept, new or existing user); **New Organization dialog** (SuperAdmin) + **New Project dialog**
(Manager) in the sidebar switchers; Team page; login + accept-invite pages; global auth middleware.

**P3 — License & Multi-Agent (The M Desk / DSPTCH)** ✓ License issue/list/revoke/verify;
license middleware (`Bearer lic_…`, kill-switch, expiry, heartbeat); **atomic `claim-next`**
(`FOR UPDATE SKIP LOCKED`, sector-filtered, priority-ordered, WIP loop-guard); lease heartbeat

- **watchdog re-queue**; mission complete with **idempotency keys**; **control orders**
  (targeted/sector/broadcast + `stand_down`); deployment lifecycle; M Desk UI (issue, roster,
  kill-switch).

**P4 — Hand-offs & References** ✓ `hand_off_mission` (new mission in target sector +
shared context + `parentId` + **bidirectional typed references** [semantic + provenance] +
`maxHandoffDepth` loop-guard + idempotency); `POST /projects/:id/references` (link_missions,
bidirectional, self-link rejected); reference graph rendered as **SVG connector lines** on the
board (toggleable) + clickable references in the dossier drawer.

**P5 — EGM + Q-Branch** ✓ **Briefing** endpoint (layered: vision → operation → Q-equipment →
Archive knowledge; dual-auth user/agent); **The Archive** (dossiers + knowledge docs); **Cold
Read** gate (Recruit verdict pass→ready / fail→designing, zero-context enforced); Q-Branch reads
(quality-gates / harness / design-guidelines `?theme=active` + theme registry); **gate
enforcement** at the transition chokepoint (`requireGoldfish`, `requireHarnessPass`,
`requireArtifacts`, `requireAcceptanceChecked`); agent artifact attach; **event bus + SSE**
(`GET /api/v1/events`); Q-Branch UI page.

**P6 — MCP server + Local Agent Mode** ✓ MCP server `citadel` with **18 `citadel_*` tools**
([mcp/citadel.ts](mcp/citadel.ts)) wrapping the REST API, License-authenticated. Two transports:
**stdio** ([mcp/stdio.ts](mcp/stdio.ts), `citadel-mcp` bin) and **streamable-HTTP**
(`POST /api/mcp`, Bearer license). Drivers: the **`/citadel-work` skill** (loop in-session) and
the **`citadel-agent` CLI** ([bin/citadel-agent.ts](bin/citadel-agent.ts)) with `--driver
claude` (fresh Claude per mission via the Agent SDK), `--driver generic --exec` (any runtime),
and `--dry-run` (loop testing, no agent). The loop is model-agnostic — see the runtime-neutral
[Agent Integration Contract](docs/AGENT_INTEGRATION.md). Also [.mcp.json.example](.mcp.json.example).

**P7 — HQ-UI** ✓ **Situation Room** (metric cards, active operation, **review queue** with
gate-enforced approve/reject, agent roster, blocked & cold-read panels, status distribution,
**live via SSE**); **Operations** (plan + close); **Control & Audit** (The Wire timeline +
broadcast orders); enriched **Dossier drawer** (sections + Cold Read verdict + activity timeline +
clickable references). Supporting endpoints: project/mission activity, metrics, operations
create/close. (M Desk, Team, Q-Branch shipped in P3/P2/P5.)

**P8 — Leiter (Webhooks & Notifications)** ✓ In-app **notifications** (fan-out to org managers +
project members on review_requested / blocked / lease_expired / handed_off; list + mark-read API;
topbar bell with unread badge + dropdown); outbound **webhooks** (HMAC-signed POST with one retry,
delivery log; project CRUD). A Nitro plugin (Leiter) subscribes to the event bus and dispatches both.

**P9 — Remote/Cloud Runner** ◑ _Deferred by design (§19)._ The runner **contract** is documented
in [RUNNER.md](RUNNER.md) and the building blocks are in place: Deployment lifecycle (opened on
claim, closed on complete; runner status + token/cost fields) observable via
`GET /api/v1/projects/:id/deployments`, repository binding, leases+watchdog, kill-switch, and the
`citadel-agent` driver. Container orchestration/autoscaling/egress isolation remain out of scope.

**P10 — Hardening** ✓ Per-license **rate limiting** (429 on exceed; per-project `callsPerMin`);
**tamper-evidence** verify endpoint (`audit-verify` walks the hash chain, flags the broken entry);
**license rotation** (new key, old → 401); **cancel-cascade** (cancelling a mission cancels its
open spawned children); **FinOps** cost attribution (`finops`: spend by agent/operation + quota);
**GDPR export** (`organizations/:id/export`, key material stripped); **Archivist** knowledge
refresh. _Secret-store / Redis backplane / EU-region remain deferred infra (§19)._

**Ops Console & Admin** ✓ An **Ops Console** (`/:project/console`) to fire any API call by hand
(method/path/JSON body, as HQ session or with an agent Bearer license; quick-action presets;
response shows status + `traceId`). An **Admin** page (`/:project/admin`, manager-only) with an
org-wide metrics rollup, FinOps cost attribution, and a live **Trace Log** that groups every
agent/HQ request by `traceId` (expand to see the activity + errors that request produced) — backed
by `GET /api/v1/projects/:id/traces`.

**P11 — Monitoring & Tracing (Echelon)** ✓ **traceId** propagation (W3C `traceparent`/`x-trace-id`
→ AsyncLocalStorage → auto-stamped on The Wire + ErrorEvents; echoed in `x-trace-id` response
header); **ErrorEvent capture** (Nitro error hook for 5xx + `POST /api/v1/errors` for
frontend/runner/MCP); **`/health`** (DB readiness); **Diagnostics — Echelon** UI page (system
health, Wire tamper-evidence, agent-run/runner status, error feed; live via SSE). _OpenTelemetry
spans / Sentry / Prometheus / Grafana remain deferred infra (§19)._

## Stack

Nuxt 4 · Vue 3 · Tailwind v4 (semantic tokens, multi-theme) · Pinia · @nuxtjs/i18n (EN/DE) ·
vuedraggable · @nuxt/icon (lucide) · @nuxt/fonts. Backend (P1+): Nitro `server/api/v1`,
Postgres + Drizzle, Zod, nuxt-auth-utils.

## Themes

Two seed themes, switchable at runtime (Topbar): **`defcon-5`** (default — editorial poster,
flat, legible) and **`cyberwar`** (neon HUD, glitch dialed back). Components consume only semantic
tokens (`bg-background`, `text-accent`, `font-heading`, …) so a theme = a CSS-variable override
layer under `[data-theme]`.

## Tests

```bash
npm test               # fast unit suite (no infrastructure)
npm run test:integration   # + DB-backed tests against localhost:5433 (seed first)
```

Unit tests cover the deterministic core (state-machine, reference inverse map, password/license
crypto, trace-id parsing, rate limiter, validation schemas), the **MCP server** (the 18 `citadel_*`
tools + their input schemas, over an in-memory transport) and the **`/citadel-work` skill**
(frontmatter + a drift check that every `citadel_*` tool it mentions is actually registered, plus
`.mcp.json.example` validity). Integration tests self-skip unless `TEST_DATABASE_URL` is set, and
verify The Wire hash-chain + reference bidirectionality against a seeded DB.

### End-to-end behaviour (HTTP scenario + demo)

A scenario harness drives the **running server** through the whole workflow — auth, tenancy,
M Desk, EGM (dossier + Cold Read), DSPTCH claim, both Quality Gates, hand-off chain, concurrency
(SKIP LOCKED), kill-switch, and tamper-evidence — as 14 asserted steps.

```bash
npm run dev                    # terminal 1 — server on :3000
npm run test:http              # terminal 2 — HTTP scenario + MCP-tools-vs-REST (re-seeds first)
npm run demo                   # …or as a narrated transcript (re-seeds, prints ✓/✗ per step)
```

Both target `CITADEL_URL` (default `http://localhost:3000`) and re-seed for a deterministic slate.

## Code quality & CI

Every push to `main` and every pull request runs the [CI workflow](.github/workflows/ci.yml):
lint → format check → typecheck → unit + integration tests (against a Postgres service
container) with coverage → build. That single gate is what the **CI** and **coverage** badges
at the top report.

```bash
npm run lint           # ESLint (flat config, @nuxt/eslint) — real bugs/bad patterns
npm run lint:fix       # …auto-fixable subset
npm run format         # Prettier — write
npm run format:check   # Prettier — verify (CI uses this)
npm run typecheck      # vue-tsc strict null/type checking
npm run test:coverage  # vitest + v8 coverage → ./coverage (lcov + html)
```

Prettier owns formatting; ESLint's stylistic rules are off and `eslint-config-prettier` clears
the rest, so the two never fight. Coverage is scoped to the pure core-logic modules the test
suites own (`server/utils/**`, `mcp/**`); API route handlers are exercised by the HTTP scenario
suite instead.

> **Coverage badge setup (one-time):** sign in at [codecov.io](https://codecov.io) with GitHub
> and add the repo. Public repos need no token; if Codecov asks for one, add it as the
> `CODECOV_TOKEN` repository secret. Until then CI stays green (`fail_ci_if_error: false`) and
> the badge simply shows "unknown".

## Run the full stack in Docker

Plain `docker compose up` is Postgres-only (for local `npm run dev`). The whole app —
auto-migrated and seeded — runs under the `full` profile:

```bash
docker compose --profile full up --build   # or: task stack
# → HQ + API + MCP on http://localhost:3000
```

## License

Citadel Ops is **source-available** under the [Business Source License 1.1](LICENSE) (BSL 1.1),
© 2026 Tobias Herb.

- **You may** read, modify, self-host, and make non-production use freely — and production use too,
  **except** offering Citadel as a hosted/embedded service that competes with the Licensor's own
  paid offerings (see the _Additional Use Grant_ in [LICENSE](LICENSE)).
- **Change Date:** on **2030-06-25** (or four years after each version's release, whichever is
  earlier) the code automatically converts to the **Apache License 2.0**.
- Need terms beyond the grant (e.g. a competing commercial offering)? A commercial license is
  available — contact **tobias@zirmail.de**.

BSL 1.1 is _not_ an OSI "open source" license, but the code is public and becomes Apache-2.0 over
time. All third-party dependencies are permissively licensed (MIT/ISC/BSD/Apache); their notices
are retained as required.
