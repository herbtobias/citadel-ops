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
- A License may also carry capability **scopes**: `plan` — the **Planner** capability, which
  unlocks the planning tools (create/groom Operations & Missions); and `recon` — the
  **Scout/Interrogator** capability, which unlocks writing The Archive when onboarding a brownfield
  project. A License without a scope is `403`'d on the corresponding endpoints.
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
- **stdio**: run `mcp/stdio.ts` (env `CITADEL_URL` + a credential). Good for local agents that
  launch a subprocess per session. Credential is either `CITADEL_TOKEN` (a **provisioning key** —
  the agent mints a short-lived session license via `citadel_acquire_license`; one durable secret
  serves many agents) or `CITADEL_LICENSE` (a static agent key, classic single-agent mode).

In Claude Code, the **`/citadel-init`** skill wires this up for you (writes/merges `.mcp.json` with
`${CITADEL_TOKEN}` env-expansion, gitignores the secret holder, and verifies the connection).

Tools:

```
citadel_acquire_license        citadel_get_briefing            citadel_get_quality_gates
citadel_get_harness            citadel_get_design_guidelines   citadel_check_orders
citadel_claim_next_mission     citadel_get_mission             citadel_list_missions
citadel_file_dossier           citadel_run_cold_read           citadel_log_work(add_comment)
citadel_attach_artifact        citadel_hand_off_mission        citadel_submit_for_review
citadel_report_blocker         citadel_complete_mission        citadel_heartbeat

# Planning — require the `plan` scope:
citadel_plan_operation         citadel_create_mission          citadel_update_mission
citadel_link_missions          citadel_propose_quality_gate

# Brownfield onboarding — read for any license, write/delete/finish require the `recon` scope:
citadel_read_archive           citadel_write_knowledge         citadel_delete_knowledge
citadel_finish_recon
```

### 3.2 REST — `/api/v1/agent/**`

The same loop without MCP. All require the `Authorization: Bearer` header.

| Step                                                        | Method + path                               |
| ----------------------------------------------------------- | ------------------------------------------- |
| Acquire a session license from a provisioning key           | `POST /api/v1/agent/acquire`                |
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

Planning — require the `plan` scope (keys, not UUIDs):

| Step                        | Method + path                      |
| --------------------------- | ---------------------------------- |
| Plan an Operation           | `POST  /api/v1/agent/operations`   |
| Create a Mission (backlog)  | `POST  /api/v1/agent/missions`     |
| Groom a Mission (id or key) | `PATCH /api/v1/agent/missions/:id` |
| Link two missions by key    | `POST  /api/v1/agent/links`        |

Brownfield onboarding — read for any project-bound license, write/delete require the `recon` scope:

| Step                                  | Method + path                             |
| ------------------------------------- | ----------------------------------------- |
| Read the full Archive (incl. body)    | `GET    /api/v1/agent/knowledge`          |
| Write a KnowledgeDoc (upsert by path) | `POST   /api/v1/agent/knowledge`          |
| Retract a KnowledgeDoc by path        | `DELETE /api/v1/agent/knowledge?path=<p>` |

#### Kick off an Operation with a Planner agent

A Planner turns one objective into an Operation + a set of linked Missions, which field agents
then claim and execute. The MCP flow (a License with the `plan` scope):

```
citadel_plan_operation  { codename:"Daybreak", objective:"Add OAuth login", activate:true }
                        → OP-1
citadel_create_mission  { title:"OAuth backend", sector:"BACKEND",  operationKey:"OP-1", status:"ready" }
                        → WEB-1
citadel_create_mission  { title:"Login UI",      sector:"FRONTEND", operationKey:"OP-1", status:"ready" }
                        → WEB-2
citadel_link_missions   { sourceKey:"WEB-2", targetKey:"WEB-1", linkType:"relates_to" }
```

`status:"ready"` makes a Mission immediately claimable; omit it (defaults to `backlog`) to groom
or run a design + Cold Read pass first. With the `/citadel-work` skill you can just say _"Plan
Operation 'Daybreak' — add OAuth login; break it into missions"_ and the agent issues these calls.
The same flow over plain REST is a runnable script:
[`examples/plan-operation.sh`](../examples/plan-operation.sh) (`CITADEL_LICENSE=lic_008_demo sh examples/plan-operation.sh`).

Briefing / gates / harness / design-guidelines are read from the project endpoints, e.g.
`GET /api/v1/projects/:id/briefing`, `…/quality-gates`, `…/harness`, `…/design-guidelines?theme=active`.

#### Proposing Quality Gates (Planner)

A Planner can also turn the requirements into **Quality Gates**. `citadel_propose_quality_gate`
(→ `POST /api/v1/agent/quality-gates`) files a gate that lands **`pending`** — it is recorded and
visible in HQ but does **not** enforce until a manager activates it in the Q-Branch (M's Desk
authority). This mirrors the SENTINEL model for knowledge: agents may write, but a human gates what
takes effect.

```
citadel_propose_quality_gate { key:"review-gate", name:"Artifacts before Review",
                               appliesToStatus:"in_review", rule:{ requireArtifacts:true } }
                             → pending (awaiting M)
```

Agent reads (`citadel_get_quality_gates`, the Briefing) only ever return **active** gates/harness/
guidelines — pending and manager-retired (`inactive`) equipment is hidden from field agents and
never enforced. M authors, activates, deactivates and deletes equipment from the HQ Q-Branch page.

#### Brownfield onboarding (Scout · Interrogator · Planner)

Greenfield, a Planner invents the work from nothing. For an **existing** codebase you first fill
The Archive so the Planner has real context. Three roles, run in order:

1. **Scout** (codename _Recon_, `recon` scope) — reads the actual repo and files what it finds
   into The Archive via `citadel_write_knowledge`: a top-level `README` summary plus a doc per
   major area (stack, structure, conventions, build/test, risks). Skill: `/citadel-scout`.
2. **Interrogator** (codename _Debrief_, `recon` scope) — interviews the operator for what code
   can't reveal (goals, constraints, domain rules, deploy, decisions) and files the answers under
   `INTEL/*`. Skill: `/citadel-debrief`.
3. **Planner** (`plan` scope) — `citadel_read_archive` to deep-read everything the first two
   filed, asks the operator what to pursue (new feature / raise code quality / fix bugs), then
   plans the Operation + Missions as above.

```
citadel_write_knowledge { path:"README", level:0, summary:"Nuxt 4 site — pricing + checkout",
                          bodyMarkdown:"..." }
citadel_write_knowledge { path:"server/", level:1, parentPath:"README", summary:"Nitro API ...",
                          bodyMarkdown:"..." }
citadel_write_knowledge { path:"INTEL/constraints", summary:"GDPR + autumn deadline",
                          bodyMarkdown:"..." }            # Interrogator
citadel_read_archive    {}                                # Planner deep-reads, then plans
```

KnowledgeDocs are upserted by `path` (writing the same path updates it) and surface in the
Briefing's `archive.knowledge` (summaries) and in full via `citadel_read_archive`. The same flow
over plain REST is a runnable script:
[`examples/scout-codebase.sh`](../examples/scout-codebase.sh)
(`CITADEL_LICENSE=lic_010_demo sh examples/scout-codebase.sh`).

#### Deleting data & retention

Citadel separates **work product** (deletable) from the **audit trail** (The Wire — append-only,
hash-chained, tamper-evident). The deletion model:

| Scope               | How                                                                    | Who             |
| ------------------- | ---------------------------------------------------------------------- | --------------- |
| One Archive doc     | `DELETE /api/v1/agent/knowledge?path=<p>` (`citadel_delete_knowledge`) | agent (`recon`) |
| Archive doc/subtree | `DELETE /api/v1/projects/:id/knowledge?path=<p>` or `?prefix=INTEL/`   | manager         |
| Whole project       | `DELETE /api/v1/projects/:id?confirm=<KEY>` (cascade)                  | manager         |
| Whole org (tenant)  | `DELETE /api/v1/organizations/:id?confirm=<slug>` (cascade)            | SuperAdmin      |

- **Archive deletions are logged** to The Wire (`knowledge_deleted`) — the removal itself is
  auditable. Use the `prefix=INTEL/` purge to drop operator-elicited intel on request.
- **Purges are irreversible** and require a matching `confirm` (the project key / org slug), so a
  stray call can't wipe a tenant. They cascade through every child row (missions, dossiers, the
  Archive, references, artifacts, **The Wire**, gates, licenses, themes…).
- **Audit policy: full purge only.** The Wire is never selectively edited (that would break the
  hash chain) — GDPR erasure of a tenant's audit data happens by purging the whole project/org.
  Platform users are global and survive an org purge (only their memberships go).
- GDPR export (the read side) is `GET /api/v1/organizations/:id/export`.

---

## 4. The mission loop (every driver implements this)

Fresh context **per mission** — forget the previous mission and re-fetch only
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
spawns `<cmd>` in a **fresh process** (fresh context per mission) with the mission context, the License, and the MCP
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
