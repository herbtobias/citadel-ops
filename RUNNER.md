# Citadel Ops — Agent Execution & the Remote Runner (P9)

Two execution modes (§20). **Local Mode is shipped (P6)**; the **Remote/Cloud Runner is
deliberately deferred** — full orchestration (ephemeral containers, k8s Jobs / Firecracker /
Fly Machines / Fargate, autoscaling, egress isolation) is out of the current scope per §19.

This document is the **contract** a remote runner implements, plus the building blocks that
are already in place so the runner is a thin layer when it's built.

## Local Mode (shipped)

Local Claude Code attaches the `citadel` MCP (`.mcp.json`) and runs the mission loop via the
`/citadel-work` skill or the `citadel-agent` CLI. See the README "Local agent mode".

## Remote Runner contract (deferred)

A cloud runner is just an unattended host for the **same `citadel-agent` loop**:

1. **Lease a License** per worker (issued from The M Desk, scoped to sector(s)).
2. **Poll** `POST /api/v1/agent/claim-next`. On `claimed: null`, idle/scale-to-zero.
3. **Spawn an ephemeral, sandboxed Claude Code session per mission** (fresh context = EGM):
   - one git **worktree** per mission (`mission/<KEY>`), isolated working copy;
   - **egress allowlist** (only the Citadel API + the repo host);
   - resource + wall-clock caps.
4. Run the loop: `get_briefing` → work → `attach_artifact` (test_report) → `complete_mission`
   (or `hand_off_mission`). Heartbeat via `citadel_heartbeat` so the lease doesn't expire.
5. **Report** token/cost spend back onto the Deployment (see below); honor `check_orders`
   (`stand_down` → terminate the container).
6. **Integration-Gate**: merge to the default branch only after Quality Gates (incl. harness)
   and any required review pass; an optional INFRA Integration-Mission handles merge/conflicts.

## Building blocks already in place

- **Deployment lifecycle** (`deployments` table): a Deployment row is opened on `claim-next`
  (`runnerStatus: running`) and closed on `complete` (`succeeded`/`failed`). Fields
  `tokenBudget`/`tokensSpent`/`costBudget`/`costSpent` are ready for FinOps (enforced in P10).
  Observable via `GET /api/v1/projects/:id/deployments`.
- **Repository binding**: `repositories` table + `missions.repositoryId/branch/worktreePath`
  carry the git context a runner needs.
- **Leases + watchdog** (§21): expired leases auto-requeue, so a crashed runner never strands a
  mission.
- **Kill-switch**: revoke the worker's License → its next call gets `401 license_revoked` and the
  watchdog requeues its work.
- **The driver**: `citadel-agent` is exactly the process a runner supervises; the runner only adds
  container/worktree isolation and autoscaling around it.

## Why deferred

Per §19 the heavy infra (runner orchestration, CI/CD, IaC, job queue, DB-ops, HA) is intentionally
out of scope for the MVP. The contract above means adopting a runner later is additive — no API
changes required.
