# Agent Integration Contract

Citadel Ops is **agent-agnostic**. The server (REST API + MCP) is the source of truth and
holds _all_ the intelligence — the state machine, Quality Gates, Cold Read, leases, the
kill-switch, the hash-chained audit. A Field-Agent is just something that **calls the tools**.
Whether that agent is Claude Code, Google Antigravity, a Hermes model in your own harness, or a
shell script is irrelevant to Citadel: it only checks the **License** and validates each call.

This document is the runtime-neutral contract. Any agent that honors it can participate.

---

## 1. Three layers (only the bottom one is runtime-specific)

| Layer        | What                                                 | Runtime coupling                  |
| ------------ | ---------------------------------------------------- | --------------------------------- |
| **Protocol** | REST `/api/v1/agent/**` and MCP (`/api/mcp` + stdio) | none — open standards             |
| **Loop**     | the mission loop in §4 (what to call, in what order) | none — this document              |
| **Driver**   | how a concrete runtime executes the loop             | runtime-specific (a thin adapter) |

If your agent speaks **MCP**, point it at the Citadel MCP server and give it §4 as instructions —
that is the whole integration. If it doesn't, drive the same loop over plain **REST** (§3.2).

---

## 2. Authentication — the License (M Desk)

Every agent call carries a **License** as a bearer token:

```
Authorization: Bearer lic_xxxxxxxx
```

- A License is scoped to an org/project and to one or more **Sectors** (FRONTEND, BACKEND, QA,
  INFRA, SECURITY, DESIGN). You may only claim missions in your sectors.
- HQ can **revoke** a License at any time (kill-switch). After revocation every write returns
  `401 license_revoked` → the agent must **stop immediately** (stand down).
- Licenses are short-lived and rotatable. Treat the token as a secret; never write it into a
  dossier, comment, artifact, or log.

There is no other credential. The same token works for both transports.

---

## 3. The two transports (pick either; they are equivalent)

### 3.1 MCP — `citadel` server

Two distributions, both License-authenticated, exposing the same `citadel_*` tools:

- **Streamable-HTTP**: `POST {CITADEL_URL}/api/mcp` with the `Authorization: Bearer` header.
  Stateless JSON mode — any MCP-compliant client works (e.g. Antigravity, Claude Code).
- **stdio**: run `mcp/stdio.ts` (env `CITADEL_URL`, `CITADEL_LICENSE`). Good for local agents
  that launch a subprocess per session.

Tools:

```
citadel_acquire_license        citadel_get_briefing            citadel_get_quality_gates
citadel_get_harness            citadel_get_design_guidelines   citadel_check_orders
citadel_claim_next_mission     citadel_get_mission             citadel_list_missions
citadel_file_dossier           citadel_run_cold_read           citadel_log_work(add_comment)
citadel_attach_artifact        citadel_hand_off_mission        citadel_submit_for_review
citadel_report_blocker         citadel_complete_mission        citadel_heartbeat
```

### 3.2 REST — `/api/v1/agent/**`

The same loop without MCP. All require the `Authorization: Bearer` header.

| Step                                                        | Method + path                               |
| ----------------------------------------------------------- | ------------------------------------------- |
| Check in (identity + sectors + active project)              | `POST /api/v1/agent/check-in`               |
| Read control orders (pause / stand-down / redirect)         | `GET  /api/v1/agent/orders`                 |
| Claim the next mission in your sector (atomic)              | `POST /api/v1/agent/claim-next`             |
| Attach an artifact (pr / commit / file / url / test_report) | `POST /api/v1/agent/missions/:id/artifacts` |
| Add a comment / work-log                                    | `POST /api/v1/agent/missions/:id/comments`  |
| Heartbeat (extend the lease on long work)                   | `POST /api/v1/agent/missions/:id/heartbeat` |
| Hand off to another sector                                  | `POST /api/v1/agent/missions/:id/hand-off`  |
| Submit for review (non-blocking)                            | `POST /api/v1/agent/missions/:id/submit`    |
| Complete (Quality Gates enforced)                           | `POST /api/v1/agent/missions/:id/complete`  |
| Report a blocker                                            | `POST /api/v1/agent/missions/:id/block`     |

Briefing / gates / harness / design-guidelines are read from the project endpoints, e.g.
`GET /api/v1/projects/:id/briefing`, `…/quality-gates`, `…/harness`, `…/design-guidelines?theme=active`.

---

## 4. The mission loop (every driver implements this)

Fresh context **per mission** (EGM / "Goldfish") — forget the previous mission and re-fetch only
what this one needs. This is mandatory: it keeps agents cheap and prevents context-rot.

```
1. check-in              → note your alias + sectors + active project
2. read briefing + Q     → briefing once; quality-gates, harness, design-guidelines (build in-style)
3. read orders           → if standDown: STOP
4. claim-next            → if none: backlog drained, stop
5. work the mission by type:
     design   → file a dossier (problem, plan, affected files, acceptance) → goes to cold_read;
                a DIFFERENT agent runs the Cold Read (never cold-read your own dossier)
     feature/bugfix/chore → implement on branch mission/<KEY>; run the harness;
                attach a test_report (and a pr) artifact
     test     → run tests; on failure hand off a bugfix (linkType "fixes") to the owning sector
     research/spike → record findings via comment or dossier
     need another sector? → hand-off (the new mission inherits dossier + artifacts + a back-reference)
6. heartbeat on long work so the lease doesn't expire
7. finish → submit-for-review (non-blocking) or complete (gates enforced — attach artifacts first)
8. clear context for this mission → go to 3
```

### Hard rules (the server enforces these; your driver must respect them)

- **Sector scope.** Claiming only returns missions in your sectors. Everything else is a hand-off.
- **Fresh context per mission.** Re-read briefing/dossier each time; do not carry stale state.
- **Kill-switch.** Any `401 license_revoked` → stop at once.
- **Gates.** `complete` fails unless the Quality Gates pass (e.g. a `test_report` artifact for the
  harness gate). Attach artifacts before completing.
- **Idempotency.** Writes accept an `Idempotency-Key` header for safe retries.
- **No secrets** in any briefing, dossier, comment, artifact, or log.

---

## 5. Drivers shipped in this repo

All three implement §4; they differ only in step 5 ("work the mission"). See
[`bin/citadel-agent.ts`](../bin/citadel-agent.ts) and [`.claude/skills/citadel-work/SKILL.md`](../.claude/skills/citadel-work/SKILL.md).

| Driver                         | Command                                         | Runtime                                           |
| ------------------------------ | ----------------------------------------------- | ------------------------------------------------- |
| Claude skill (`/citadel-work`) | in a Claude Code session                        | Claude Code, loop inside the session              |
| Claude CLI                     | `citadel-agent --driver claude`                 | fresh Claude Code process per mission (Agent SDK) |
| **Generic (BYO-agent)**        | `citadel-agent --driver generic --exec "<cmd>"` | **any** runtime                                   |
| Dry-run                        | `citadel-agent --dry-run`                       | none (stub-completes; tests the loop)             |

### The generic driver — bring your own agent

`--driver generic --exec "<cmd>"` runs the model-agnostic loop and, for each claimed mission,
spawns `<cmd>` in a **fresh process** (EGM) with the mission context, the License, and the MCP
entrypoint in the environment:

```
CITADEL_URL              CITADEL_LICENSE          CITADEL_MCP_STDIO   (path to mcp/stdio.ts)
CITADEL_MISSION_ID       CITADEL_MISSION_KEY      CITADEL_MISSION_TITLE
CITADEL_MISSION_OBJECTIVE CITADEL_MISSION_BRIEFING CITADEL_MISSION_SECTOR  CITADEL_MISSION_TYPE
```

`<cmd>` is your agent. It does the work for that one mission and finishes it through the citadel
tools (MCP via `CITADEL_MCP_STDIO`, or REST with `CITADEL_LICENSE`). Exit `0` = handled; a non-zero
exit makes the driver report a blocker. This is the integration seam for Hermes, Antigravity, or
anything else — the orchestration stays Citadel's; the brain is yours.

---

## 6. Integrating a specific runtime

**MCP-capable runtime (e.g. Google Antigravity).** Register Citadel as an MCP server and hand the
agent §4 as its task instructions — no Citadel code changes.

- HTTP: server URL `{CITADEL_URL}/api/mcp`, header `Authorization: Bearer <license>`.
- or stdio: command `node`, args `[".../mcp/stdio.ts"]`, env `CITADEL_URL` + `CITADEL_LICENSE`.

**Non-MCP runtime (e.g. a Hermes model in your harness).** Two options:

1. Wrap it as `--exec` for the generic driver (above) — Citadel orchestrates the loop, your harness
   does one mission per invocation.
2. Or implement §4 yourself against the REST API (§3.2) inside your harness.

Either way the contract is identical and the server treats every agent the same.
