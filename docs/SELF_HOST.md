# Self-host Citadel Ops — develop Citadel _with_ Citadel (dogfooding runbook)

This runbook stands up a self-hosted Citadel instance that you use to manage the
development of Citadel itself: scout the codebase into The Archive, plan the next version
as an Operation, and let local Claude-Code agents work the Missions.

## The one rule: freeze the control plane

Do **not** run the managing instance from the same code the agents are rewriting — a
migration or restart mid-Mission would kill the very system tracking the work.

Two roles, kept apart:

|         | **Control plane** (the "Leitstelle")                        | **Working copy**                                      |
| ------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| What    | A pinned, pre-built Citadel image                           | The checkout/worktree where agents edit Citadel-vNext |
| How     | `docker-compose.selfhost.yml` → `image: citadel-ops:stable` | `git worktree` of this repo                           |
| DB      | Own volume `citadel-selfhost-pgdata`, Postgres :5434        | n/a (no server runs here)                             |
| HQ      | http://localhost:4000                                       | n/a                                                   |
| Changes | Untouched until you deliberately re-tag & restart           | All the churn happens here                            |

Because the control plane runs a **tagged image** (not `build: .`), editing the working
copy never disturbs it. You upgrade the control plane only when you choose to: rebuild,
re-tag, `up -d`.

## Prerequisites

- Docker + Docker Compose
- This repo checked out at a known-good commit (green `main` or a release tag)
- The dev stack may run alongside it — ports/volumes don't collide (dev: 3000/5433, self-host: 4000/5434)

## 1. Build & pin the control-plane image

From a known-good commit:

```bash
cd /path/to/citadel-ops
git checkout main            # or a release tag
docker build -t citadel-ops:stable .
```

This is your frozen control plane. It stays on this build until you re-tag (step 7).

## 2. First boot (seed the super-admin + demo org)

```bash
export NUXT_SESSION_PASSWORD=$(openssl rand -hex 32)   # 64 hex chars, ≥32 required
SEED_ON_START=1 CITADEL_ALLOW_SEED=true \
  docker compose -f docker-compose.selfhost.yml up -d
docker compose -f docker-compose.selfhost.yml logs -f app   # watch migrate + seed
```

The entrypoint migrates, then seeds. Seed is blocked under `NODE_ENV=production` unless
`CITADEL_ALLOW_SEED=true` — that's why it's set for this one boot.

Now log in at **http://localhost:4000**:

- **hq@citadel.test** / `citadel123` (super-admin) — **change this password immediately**

> Keep `NUXT_SESSION_PASSWORD` stable across restarts (put it in a `.env` file Compose
> reads, or export it each time). Changing it invalidates all sessions.

## 3. Drop the seed flags (so restarts don't wipe data)

Re-running the seed **deletes and recreates the demo org**. After first boot, always bring
the stack up _without_ the seed flags:

```bash
docker compose -f docker-compose.selfhost.yml up -d   # NODE_ENV=production, no seed
```

## 4. Make a home for Citadel-vNext

In HQ (http://localhost:4000), as the super-admin:

1. Create (or reuse the demo) **Organization**.
2. Create a **Project**, e.g. key `CTDL`, name "Citadel vNext".
3. **M's Desk** → issue **your provisioning key** (tick _Provisioning key_; its
   sectors/scopes are the **ceiling** it may grant — include `recon` if you'll scout). It's
   bound to you — **one per project per manager**, so several Ms can each hold their own and
   sessions stay attributable. All your agents share this one durable secret and mint their
   own short-lived, sector-scoped **session licenses** from it via the acquire handshake.
   Lost it? **Rotate** (refresh the secret; existing sessions survive). (Seed ships a demo
   key `lic_key_demo` on WEB, owned by the manager.)

Copy the provisioning key (`lic_...`) once — it's your `CITADEL_TOKEN`.

## 5. Prepare an isolated working copy

Keep agent edits away from the pinned image's source tree. A git worktree is ideal:

```bash
cd /path/to/citadel-ops
git worktree add ../citadel-vnext main
cd ../citadel-vnext
```

Point this working copy's MCP at the **control plane on :4000** (not 3000). The fastest way
is the **`/citadel-init`** skill — run `claude` in the worktree and invoke it; give it
`http://localhost:4000` and your provisioning key, and it writes `.mcp.json` (with
`${CITADEL_TOKEN}` env-expansion), wires the key into a gitignored env holder, and verifies
the connection. By hand it's `.mcp.json` like:

```json
{
  "mcpServers": {
    "citadel": {
      "command": "npx",
      "args": ["tsx", "mcp/stdio.ts"],
      "env": {
        "CITADEL_URL": "http://localhost:4000",
        "CITADEL_TOKEN": "${CITADEL_TOKEN}"
      }
    }
  }
}
```

…plus `export CITADEL_TOKEN=lic_...your_provisioning_key...` (gitignored `.envrc`/`.env.citadel`).

**Multiple agents, same project, no collision.** Each agent calls
`citadel_acquire_license({ sectors: ["BACKEND"] })` once at startup → its own ephemeral
session license, its own row in the M's Desk roster, its own kill-switch. The skills do
this for you. Two agents differ only by the (non-secret) sector they acquire — run one per
worktree/terminal. The raw session key never leaves the MCP process; revoking the
provisioning key in M's Desk cascades to every session it minted.

To scaffold a whole fleet at once, run **`/citadel-fleet BACKEND QA`**: it creates a
worktree per Sector, wires each (shared `CITADEL_TOKEN` + a `CITADEL_SECTOR` marker that
`/citadel-work` auto-acquires), and hands you the per-terminal launch commands.

## 6. The flow: Scout → (Debrief) → Plan → Work

Run these from Claude Code **inside the working copy** (`../citadel-vnext`):

1. **Scout** — `/citadel-scout`. Reads the repo and files KnowledgeDocs (stack, structure,
   conventions, build/test, risks) into The Archive on the control plane. Needs the
   `recon` scope. Finishes with one `archive_updated` notification in HQ.
2. **Debrief** _(optional)_ — `/citadel-debrief`. Interviews you for the things not in the
   code (goals, constraints, domain rules, what's fragile) → `INTEL/` docs in The Archive.
3. **Plan** — as the Planner, read the now-populated Archive (`citadel_read_archive`),
   decide what vNext should pursue, and create the **Operation + Missions** (HQ "New
   Mission" / backlog grooming, or the planning tools).
4. **Work** — `/citadel-work`. Field-agent loop: claim → work in the working copy (branch
   per Mission) → Cold Read / Quality Gates → submit/complete → next. Open a PR per Mission.

You can run several agents (one per sector/terminal, each its own license) or one license
with multiple sectors. Hand-offs to unstaffed sectors wait visibly in the backlog.

## 7. Upgrade the control plane (deliberately)

Only after vNext is merged to `main` and green. This is the safe hand-off point — the
control plane was on the old schema the whole time; now you move it forward:

```bash
cd /path/to/citadel-ops
git checkout main && git pull
docker build -t citadel-ops:stable .                       # new frozen build
docker compose -f docker-compose.selfhost.yml up -d        # restart → entrypoint migrates
```

Migrations run against the existing `citadel-selfhost-pgdata` volume, so your Operations,
Missions, Archive, and audit chain carry over.

## Operational notes

- **Backups:** the only durable state is the `citadel-selfhost-pgdata` volume.
  `pg_dump` it before an upgrade if you care about the data.
- **Kill-switch & leases work normally:** an agent that chokes on Citadel itself is
  re-queued by the watchdog; revoke its license from M's Desk to stop it dead.
- **Email/telemetry are optional:** invitations are logged (not sent) unless `SMTP_HOST`
  is set; Sentry/metrics stay no-op unless configured (see `.env.example`).
- **Tear down (keep data):** `docker compose -f docker-compose.selfhost.yml down`.
  **Wipe everything:** add `-v` to also drop the volume.
