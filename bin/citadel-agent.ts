#!/usr/bin/env node
// Citadel Ops — `citadel-agent` CLI driver (Local Agent Mode, §20).
// Pulls missions one at a time and works each in a FRESH context (EGM):
//   check-in → loop { check_orders → claim_next → work → complete → next }
// until the backlog is empty or HQ issues stand_down.
//
// The loop itself is model-agnostic — it speaks only Citadel's REST API. Only the
// per-mission "work" step is runtime-specific, selected by --driver:
//   --driver claude   (default) spawn a fresh Claude Code process per mission via the
//                      Claude Agent SDK, with the citadel MCP server attached.
//   --driver generic  spawn an arbitrary command per mission (--exec "<cmd>"), i.e.
//                      bring-your-own-agent (Hermes, Antigravity, a script). The mission
//                      context + license + MCP entrypoint are passed via env vars; the
//                      command does the work and completes/hands-off via the citadel tools.
//   --driver dry-run  (alias --dry-run) no model at all: auto-attaches a stub test_report
//                      and completes, so the orchestration is testable without any agent.
// See docs/AGENT_INTEGRATION.md for the runtime-neutral contract every driver implements.
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { makeCitadelClient } from '../mcp/citadel'

const args = process.argv.slice(2)
const has = (f: string) => args.includes(f)
const val = (f: string, d?: string) => {
  const i = args.indexOf(f)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}

const baseUrl = val('--url', process.env.CITADEL_URL) || 'http://localhost:3000'
const license = val('--license', process.env.CITADEL_LICENSE)
const execCmd = val('--exec', process.env.CITADEL_EXEC)
const maxMissions = Number.parseInt(val('--max', '0') || '0', 10) // 0 = unlimited

// Driver resolution (back-compatible): --dry-run wins; --exec implies generic;
// otherwise --driver <name>, defaulting to claude.
const driver = has('--dry-run')
  ? 'dry-run'
  : (val('--driver', execCmd ? 'generic' : 'claude') as 'claude' | 'generic' | 'dry-run')

const here = dirname(fileURLToPath(import.meta.url))
const stdioEntry = resolve(here, '../mcp/stdio.ts')

if (!license) {
  console.error('Provide --license <lic_…> or CITADEL_LICENSE')
  process.exit(1)
}
if (driver === 'generic' && !execCmd) {
  console.error('--driver generic needs --exec "<command>" (or CITADEL_EXEC). The command is run once per mission.')
  process.exit(1)
}

const client = makeCitadelClient({ baseUrl, license })
const log = (...a: unknown[]) => console.error('[citadel-agent]', ...a)

async function workMissionDryRun(mission: any) {
  log(`  dry-run: ${mission.key} — ${mission.title}`)
  // Satisfy the harness gate, then complete.
  await client.api(`/api/v1/agent/missions/${mission.id}/artifacts`, {
    method: 'POST', body: { kind: 'test_report', url: '#', label: 'dry-run: all green' },
  })
  await client.api(`/api/v1/agent/missions/${mission.id}/complete`, {
    method: 'POST', body: { result: 'success', outcome: 'Completed by citadel-agent --dry-run' },
  })
}

// Bring-your-own-agent: spawn an arbitrary command in a fresh process per mission
// (EGM). The mission context, the license, and the MCP stdio entrypoint are handed
// over via env, so any runtime (Hermes, Antigravity, a shell script) can pick up the
// work and drive it through the citadel tools — exactly what the Claude driver does.
async function workMissionWithExec(mission: any, cmd: string) {
  log(`  exec: ${cmd}  →  ${mission.key} (${mission.sector}/${mission.type})`)
  await new Promise<void>((resolveP, rejectP) => {
    const child = spawn(cmd, {
      shell: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        CITADEL_URL: baseUrl,
        CITADEL_LICENSE: license,
        CITADEL_MCP_STDIO: stdioEntry,
        CITADEL_MISSION_ID: mission.id,
        CITADEL_MISSION_KEY: mission.key,
        CITADEL_MISSION_TITLE: mission.title ?? '',
        CITADEL_MISSION_OBJECTIVE: mission.objective ?? '',
        CITADEL_MISSION_BRIEFING: mission.briefing ?? '',
        CITADEL_MISSION_SECTOR: mission.sector ?? '',
        CITADEL_MISSION_TYPE: mission.type ?? '',
      },
    })
    child.on('exit', code => code === 0 ? resolveP() : rejectP(new Error(`exec exited with code ${code}`)))
    child.on('error', rejectP)
  })
}

async function workMissionWithClaude(mission: any) {
  // Fresh Claude Code process per mission, with the citadel MCP attached.
  let query: any
  try {
    ({ query } = await import('@anthropic-ai/claude-agent-sdk'))
  }
  catch {
    throw new Error('claude driver needs @anthropic-ai/claude-agent-sdk installed (npm i @anthropic-ai/claude-agent-sdk) + ANTHROPIC_API_KEY. Use --driver dry-run to test the loop, or --driver generic --exec for another runtime.')
  }
  const prompt = [
    `You are Field-Agent on Citadel Ops. Work mission ${mission.key}: "${mission.title}".`,
    `Objective: ${mission.objective}`,
    `Briefing: ${mission.briefing}`,
    `Use the citadel_* MCP tools. Fetch the briefing/dossier, do the work in this repo,`,
    `attach a test_report artifact after the harness passes, then call citadel_complete_mission.`,
    `If the work needs another sector, use citadel_hand_off_mission instead.`,
  ].join('\n')

  const run = query({
    prompt,
    options: {
      mcpServers: {
        citadel: { command: 'node', args: [stdioEntry], env: { CITADEL_URL: baseUrl, CITADEL_LICENSE: license } },
      },
    },
  })
  for await (const msg of run) {
    if (msg?.type === 'result') log(`  claude: ${msg.subtype ?? 'done'}`)
  }
}

async function main() {
  const ctx = await client.api('/api/v1/agent/check-in', { method: 'POST' })
  log(`checked in as ${ctx.agentAlias} [${(ctx.sectors || []).join(', ')}] on ${ctx.project?.key ?? '—'} (driver: ${driver})`)

  let done = 0
  for (;;) {
    const orders = await client.api('/api/v1/agent/orders')
    if (orders.standDown) { log('stand_down received — standing down.'); break }

    const { claimed } = await client.api('/api/v1/agent/claim-next', { method: 'POST' })
    if (!claimed) { log('no claimable missions in sector — backlog drained.'); break }
    log(`claimed ${claimed.key} (${claimed.sector}/${claimed.type})`)

    try {
      if (driver === 'dry-run') await workMissionDryRun(claimed)
      else if (driver === 'generic') await workMissionWithExec(claimed, execCmd!)
      else await workMissionWithClaude(claimed)
      log(`completed ${claimed.key}`)
    }
    catch (e: any) {
      log(`mission ${claimed.key} errored: ${e?.message ?? e} — reporting blocker`)
      await client.api(`/api/v1/agent/missions/${claimed.id}/block`, { method: 'POST', body: { reason: String(e?.message ?? e) } }).catch(() => {})
    }

    done++
    if (maxMissions && done >= maxMissions) { log(`reached --max ${maxMissions}.`); break }
  }
  log(`run finished — ${done} mission(s) processed.`)
  process.exit(0)
}

main().catch((e) => { log('fatal:', e?.message ?? e); process.exit(1) })
