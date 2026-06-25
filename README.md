# Citadel Ops

A multi-agent agile-OS for AI agents — a spy-themed "HQ" where local Claude Code agents
pull **Missions** from **Operations**, work them sequentially, and report back. Humans
("HQ") watch and control everything from a Jira-like board.

See the full concept in `~/.claude/plans/neue-app-die-mir-jaunty-shamir.md`.

## Status

**P0 — Scaffold** ✓ Nuxt 4 + Tailwind v4 frontend, multi-theme foundation, app-shell +
Kanban board; Drizzle/Postgres, docker-compose, Taskfile, seed.

**P1 — Data model & Core API** ✓ Full Drizzle schema (§8) + migrations; Mission state-machine;
core CRUD (`/api/v1` projects/operations/missions + transition); The Wire (hash-chained
activity log); Pinia stores wired to `$fetch` — the board now renders from Postgres.

**P2 — Organizations, Teams & Permissions** ✓ Session auth (login/register/logout, scrypt);
permission tiers SuperAdmin / Manager / Contributor / Viewer with **row-level isolation**
(contributor sees only granted projects, viewer is read-only); email-invite flow (create +
accept, new or existing user); SuperAdmin org creation; **org & project switchers** (per-user
state); Team page; login + accept-invite pages; global auth middleware.

**P3 — License & Multi-Agent (The M Desk / DSPTCH)** ✓ License issue/list/revoke/verify;
license middleware (`Bearer lic_…`, kill-switch, expiry, heartbeat); **atomic `claim-next`**
(`FOR UPDATE SKIP LOCKED`, sector-filtered, priority-ordered, WIP loop-guard); lease heartbeat
+ **watchdog re-queue**; mission complete with **idempotency keys**; **control orders**
(targeted/sector/broadcast + `stand_down`); deployment lifecycle; M Desk UI (issue, roster,
kill-switch).

### Demo logins (password `citadel123`)
- `herb.tobias@gmail.com` — SuperAdmin (all)
- `manager@citadel.test` — Manager (all org projects)
- `agent.dev@citadel.test` — Contributor (WEB only)
- `observer@citadel.test` — Viewer (WEB, read-only)

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
(`POST /api/mcp`, Bearer license). Two drivers: the **`/citadel-work` skill** (loop in-session)
and the **`citadel-agent` CLI** ([bin/citadel-agent.ts](bin/citadel-agent.ts), `--dry-run` for
loop testing; real mode spawns a fresh Claude per mission via the Agent SDK). See
[.mcp.json.example](.mcp.json.example).

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

**P9 — Remote/Cloud Runner** ◑ *Deferred by design (§19).* The runner **contract** is documented
in [RUNNER.md](RUNNER.md) and the building blocks are in place: Deployment lifecycle (opened on
claim, closed on complete; runner status + token/cost fields) observable via
`GET /api/v1/projects/:id/deployments`, repository binding, leases+watchdog, kill-switch, and the
`citadel-agent` driver. Container orchestration/autoscaling/egress isolation remain out of scope.

**P10 — Hardening** ✓ Per-license **rate limiting** (429 on exceed; per-project `callsPerMin`);
**tamper-evidence** verify endpoint (`audit-verify` walks the hash chain, flags the broken entry);
**license rotation** (new key, old → 401); **cancel-cascade** (cancelling a mission cancels its
open spawned children); **FinOps** cost attribution (`finops`: spend by agent/operation + quota);
**GDPR export** (`organizations/:id/export`, key material stripped); **Archivist** knowledge
refresh. *Secret-store / Redis backplane / EU-region remain deferred infra (§19).*

### Local agent mode
```bash
cp .mcp.json.example .mcp.json   # paste a license from The M Desk
npm run agent -- --license lic_… --dry-run   # exercise the loop without Claude
```

### Demo agent licenses (Bearer keys, WEB project)
- `lic_007_demo` — agent 007 (BACKEND)
- `lic_009_demo` — agent 009 (QA)
- `lic_006_demo` — agent 006 (FRONTEND, DESIGN)

Agent loop: `POST /api/v1/agent/check-in` → `POST /api/v1/agent/claim-next` →
`…/missions/:id/heartbeat` → `…/missions/:id/hand-off` → `…/missions/:id/complete`;
`GET /api/v1/agent/orders` for control.

## Stack

Nuxt 4 · Vue 3 · Tailwind v4 (semantic tokens, multi-theme) · Pinia · @nuxtjs/i18n (EN/DE) ·
vuedraggable · @nuxt/icon (lucide) · @nuxt/fonts. Backend (P1+): Nitro `server/api/v1`,
Postgres + Drizzle, Zod, nuxt-auth-utils.

## Themes

Two seed themes, switchable at runtime (Topbar): `cyberpunk-glitch` (default) and
`bold-typography`. Components consume only semantic tokens (`bg-background`, `text-accent`,
`font-heading`, …) so a theme = a CSS-variable override layer under `[data-theme]`.

## Develop

```bash
npm install
npm run dev   # http://localhost:3000
```

> Requires Node ≥ 22.
