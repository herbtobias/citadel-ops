---
name: citadel-init
description: Configure the Citadel MCP server in the current project (codename Quartermaster setup) — gather the HQ URL and a provisioning key, write/merge .mcp.json with env-expansion, wire the secret out of git, and verify the connection. Use when the user says "/citadel-init", "configure citadel mcp", "connect this project to HQ", "set up the citadel server", or asks you to wire up Citadel here.
---

# Citadel Init — wire this project to HQ

You set up the **`citadel` MCP server** in the current project so an agent here can reach HQ.
You gather the HQ URL and a provisioning key, write (or merge) `.mcp.json`, keep the secret out of
any committed file via env-expansion, verify the connection against HQ, and tell the user how to
launch. You change only configuration — never product code.

> The credential model (§C): a **provisioning key** (`CITADEL_TOKEN`) is one durable secret per
> project per manager; each agent mints its own short-lived, sector-scoped **session license** from
> it at startup. See [Agent Integration Contract](../../../docs/AGENT_INTEGRATION.md) and the
> self-host runbook ([docs/SELF_HOST.md](../../../docs/SELF_HOST.md)).

## The loop

1. **Locate the stdio server.** Check whether the current directory has `mcp/stdio.ts` (you're in
   the citadel-ops checkout or one of its worktrees):
   - **Yes** → use relative args `["tsx", "mcp/stdio.ts"]`.
   - **No** (an external project) → ask the user for the absolute path to their **citadel-ops
     checkout**, confirm `mcp/stdio.ts` exists there, and use `["tsx", "<abs>/mcp/stdio.ts"]` (tsx
     resolves citadel-ops's `node_modules` from the script's directory). Offer to copy the
     `citadel-*` skills into `~/.claude/skills/` so `/citadel-work`, `/citadel-scout`, etc. are
     available here too.

2. **Gather inputs.**
   - **`CITADEL_URL`** — where HQ is reachable. Default `http://localhost:3000` (dev); use
     `http://localhost:4000` for a self-host control plane. The URL is not secret.
   - **Credential** — ask the user to issue a **Provisioning key** in HQ (**M Desk → Issue license →
     tick _Provisioning key_**; its Sectors/scopes are the ceiling it may grant) and paste the
     `lic_…`. A static `CITADEL_LICENSE=lic_…` agent key is the single-agent fallback (no acquire
     handshake).

3. **Write / merge `.mcp.json`.** If the file exists, read it and add/replace only the `citadel`
   entry under `mcpServers` — never clobber other servers. The token goes in via **env-expansion**
   so it is not stored in the file:

   ```json
   {
     "mcpServers": {
       "citadel": {
         "command": "npx",
         "args": ["tsx", "mcp/stdio.ts"],
         "env": { "CITADEL_URL": "<chosen url>", "CITADEL_TOKEN": "${CITADEL_TOKEN}" }
       }
     }
   }
   ```

   (For a static license, use `"CITADEL_LICENSE": "${CITADEL_LICENSE}"` instead.)

4. **Wire the secret out of git.** The key must live in the shell that launches `claude`, never in a
   committed file:
   - If `command -v direnv` succeeds → write/append `export CITADEL_TOKEN=lic_…` to a `.envrc` and
     tell the user to run `direnv allow`.
   - Otherwise → write `export CITADEL_TOKEN=lic_…` to `.env.citadel` and show the user the line to
     run (`source .env.citadel`, or paste the `export`) before launching `claude`.
   - Ensure the env holder (`.envrc` / `.env.citadel`) is in `.gitignore`; add it if missing. The key
     is **not** in `.mcp.json` — only the `${CITADEL_TOKEN}` reference — so no secret is committed
     even though `.mcp.json` is itself gitignored by convention.

5. **Verify live.** With `CITADEL_TOKEN` exported, curl HQ to prove it works (do **not** print the
   returned session key):
   - Provisioning key → `POST $CITADEL_URL/api/v1/agent/acquire` with `{"sectors":["BACKEND"]}`;
     expect **201**. Report the `agentAlias`, `project.key`, and `sectors` so the user sees it's
     bound to the right project.
   - Static license → `POST $CITADEL_URL/api/v1/agent/check-in`; expect **200**.
   - On `401` (revoked/expired/invalid key) or a connection error (HQ not running / wrong URL),
     surface the exact cause and stop.

6. **Finish.** Tell the user: make sure `CITADEL_TOKEN` is exported in the shell that launches
   `claude` (or `direnv allow`), **restart Claude Code**, run `/mcp` to confirm the `citadel_*` tools
   loaded, then invoke `/citadel-work` (or `/citadel-scout`). For a **fleet**: the same provisioning
   key and the identical `.mcp.json` serve every worktree — agents differ only by the Sector they
   pass to `citadel_acquire_license`, so there is no per-worktree config to diverge.

## Rules

- Never write a literal `lic_…` into `.mcp.json` — always `${CITADEL_TOKEN}` (or `${CITADEL_LICENSE}`).
- Never commit the secret: the env holder must be gitignored; confirm it before finishing.
- Merge, don't overwrite: preserve any existing `mcpServers` entries and other JSON keys.
- If verification fails, do not claim success — report the HTTP status and the likely cause.
- Provisioning key needs a reachable HQ; if `CITADEL_URL` is wrong or HQ is down, fix that first.
