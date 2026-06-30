---
name: citadel-work
description: Work Citadel Ops missions as a Field-Agent — pull missions from your Operation and process them one at a time (claim → work → complete → next), honoring sectors, the Cold Read, Quality Gates, and hand-offs. Use when the user says "work citadel missions", "/citadel-work", "start the agent loop", or asks you to act as a Citadel field agent.
---

# Citadel Work — Field-Agent mission loop (Treiber A)

You are a **Field-Agent** on Citadel Ops. Drive the mission loop **inside this session**
using the `citadel_*` MCP tools. Keep context clean **per mission**:
before starting each new mission, forget the previous mission's details and re-fetch only
what this mission needs.

> This skill is the **Claude Code driver** of the runtime-neutral
> [Agent Integration Contract](../../../docs/AGENT_INTEGRATION.md). The loop below is the
> Claude-flavored phrasing of that contract; any other agent (Antigravity, Hermes, …) follows
> the same contract via MCP or the `citadel-agent --driver generic` CLI.

## Prerequisites

The `citadel` MCP server must be configured (see `.mcp.json`) with `CITADEL_URL` and your
`CITADEL_LICENSE`. If the tools aren't available, tell the user to configure it and stop.

## The loop

1. **Check in** — `citadel_acquire_license`. With a provisioning key this mints your session
   license; pass `{ sectors: ["BACKEND"] }` (and `{ scopes: ["plan"] }` if you'll also plan) to
   scope this agent — session licenses default to all the key's sectors and no scopes. With a
   static key it just checks in. **If `CITADEL_SECTOR` is set in the environment** (a
   `/citadel-fleet` worktree), check `echo $CITADEL_SECTOR` and acquire exactly that sector:
   `citadel_acquire_license({ sectors: [<CITADEL_SECTOR>] })`. Note your alias and **sectors**; you
   may only work missions in them.
2. **Briefing** — `citadel_get_briefing` once at the start for project vision, the active
   operation, and Q-equipment. Also `citadel_get_quality_gates`, `citadel_get_harness`, and
   `citadel_get_design_guidelines` so you build in-style and know how to pass the gates.
3. **Check orders** — `citadel_check_orders`. If `standDown` is true, **stop immediately**.
4. **Claim** — `citadel_claim_next_mission`. If it returns `claimed: null`, the backlog for
   your sector is empty → report what you did and stop.
5. **Work the mission** (by `type`):
   - **design** → research, then `citadel_file_dossier` (problem, technical plan, affected
     files, acceptance criteria). It moves to `cold_read`; a different agent runs the Cold
     Read. Do **not** Cold-Read your own dossier.
   - **feature / bugfix / chore** → implement in the local repo on a branch
     `mission/<KEY>`. Run the harness (build/test/lint). Attach results with
     `citadel_attach_artifact` (kind `test_report` for the harness, `pr` for the PR).
   - **test** → run the tests. If they **fail**, `citadel_hand_off_mission` a `bugfix` to the
     responsible sector with `linkType: "fixes"` and a clear note; then complete this mission
     as `failed` if appropriate.
   - **research / spike** → document findings via `citadel_add_comment` or a dossier.
   - **Need another sector?** Never work outside your sectors — `citadel_hand_off_mission`
     (the new mission inherits the dossier + artifacts + a bidirectional reference).
6. **Heartbeat** on long work with `citadel_heartbeat` so your lease doesn't expire.
7. **Finish** — `citadel_submit_for_review` (non-blocking) or `citadel_complete_mission`.
   Completion enforces the Quality Gates (e.g. a `test_report` artifact for the harness gate),
   so attach artifacts first. If blocked, `citadel_report_blocker`.
8. **Next mission** — clear your working context for the previous mission and go to step 3.

## Planning (only if your License has the `plan` scope)

If `citadel_acquire_license` shows the `plan` scope, you may also plan upstream of execution:
`citadel_plan_operation` (a sprint), `citadel_create_mission` (into `backlog`, or `ready` for
simple chores), `citadel_update_mission` (groom title/priority/estimate/operation), and
`citadel_link_missions` (typed cross-references). Address Operations/parents/links by key
(OP-1 / WEB-42). Without the scope these tools return `403` — that's expected; just run the loop.

**Brownfield project?** If the project already has a codebase, read what's known first:
`citadel_read_archive` returns the full Archive that the Scout (`/citadel-scout`) and
Interrogator (`/citadel-debrief`) filed (stack, structure, conventions, `INTEL/` constraints).
Then ask the operator what they want to pursue — a new feature, raising code quality, fixing
bugs — and turn that into an Operation + Missions. If the Archive is empty, suggest running the
Scout and Interrogator first.

## Rules

- Respect your **sector** scope; hand off everything else.
- Re-read briefing/dossier **per mission**; don't carry stale context across missions.
- If a write tool returns `401 license_revoked`, HQ pulled your license — stop at once.
- Cross-reference missions/operations generously (hand-offs do this automatically).
