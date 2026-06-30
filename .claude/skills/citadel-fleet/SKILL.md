---
name: citadel-fleet
description: Set up a fleet of Citadel worker agents — one git worktree per Sector, each wired to HQ with the shared provisioning key plus its own Sector marker, then hand the operator the exact launch commands. Use when the user says "/citadel-fleet", "set up a fleet", "run multiple agents", "one agent per sector", or asks to scaffold parallel Citadel workers.
---

# Citadel Fleet — scaffold one worker per Sector

You set up a **fleet**: one git worktree per Sector, each a separate working copy so agents never
collide on files, all sharing **one** provisioning key. You **prepare and hand off** — you do not
run the agents yourself. Each worker is its own interactive Claude Code session the operator
launches in a separate terminal.

> Why worktrees: file isolation (two agents must not edit the same checkout). Why one key: identity
> is minted per session via the acquire handshake (§C), so every worktree shares the same
> `CITADEL_TOKEN` and differs only by the Sector it acquires. See `/citadel-init` (per-project MCP
> wiring) and [docs/SELF_HOST.md](../../../docs/SELF_HOST.md).

## Inputs

- The **Sectors** to staff, e.g. `BACKEND QA` — one worktree + agent each.
- The **base branch** to fork each worktree from (default: the current branch, else `main`).
- A naming **prefix** for the worktree directories (default: the repo name).
- The **provisioning key** (`CITADEL_TOKEN`) and **`CITADEL_URL`** — reuse the current project's if
  it's already configured (e.g. by `/citadel-init`); otherwise gather them the way `/citadel-init`
  does (issue a Provisioning key in HQ → M Desk).

## The loop

1. **Confirm the plan.** List the worktrees you'll create (path · Sector · branch) and the shared
   `CITADEL_URL`. Confirm with the operator **before** touching git. Flag any target path or branch
   that already exists.
2. **Create a worktree per Sector.** `git worktree add <prefix>-<sector-lower> <branch>` with a fresh
   branch each (e.g. `mission/backend`), placed as siblings (e.g. `../<prefix>-be`, `../<prefix>-qa`).
3. **Wire each worktree** exactly as `/citadel-init` does, with one addition — the Sector marker:
   - `.mcp.json`: `args` = relative `["tsx", "mcp/stdio.ts"]` if the worktree itself contains
     `mcp/stdio.ts` (a citadel-ops worktree), else the absolute path to the citadel-ops checkout;
     `env`: `{ "CITADEL_URL": "<url>", "CITADEL_TOKEN": "${CITADEL_TOKEN}" }`.
   - a **gitignored** env holder (`.envrc` for direnv, else `.env.citadel`) containing **both**
     `export CITADEL_TOKEN=lic_…` **and** `export CITADEL_SECTOR=<SECTOR>`. Ensure
     `.envrc` / `.env.citadel` are in `.gitignore`.
4. **Verify the key reaches HQ once** (any worktree, do **not** print the session key):
   `POST $CITADEL_URL/api/v1/agent/acquire` with `{"sectors":["<that worktree's Sector>"]}` → expect
   **201**. If it fails (401 / connection), fix the URL or key before handing off.
5. **Hand off the launch commands.** Print, per worktree, the commands the operator runs in a
   **separate terminal**:
   ```sh
   cd <prefix>-be && direnv allow    # or: source .env.citadel
   claude                            # trust the citadel MCP server
   /citadel-work                     # auto-acquires CITADEL_SECTOR, then runs the loop
   ```
   Explain: each terminal is one field-agent; they run in parallel, claim only their own Sector, and
   hand off across Sectors via the board. Remove a worktree later with `git worktree remove <path>`.

## Rules

- One worktree per Sector — never point two agents at the same working copy (file collisions).
- The **same** `CITADEL_TOKEN` for every worktree; the only per-worktree difference is the Sector
  (`CITADEL_SECTOR`), which is not a secret.
- Never write a literal `lic_…` into `.mcp.json`; the key lives only in the gitignored env holder.
- You **scaffold and hand off** — do not try to run the agents from this session.
- Confirm the worktree plan before creating branches; surface any path/branch that already exists.
