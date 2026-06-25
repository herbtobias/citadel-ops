#!/usr/bin/env node
// Citadel Ops — `citadel-agent` CLI driver (Local Agent Mode, Treiber B, §20).
// Pulls missions one at a time and works each in a FRESH context (EGM):
//   check-in → loop { check_orders → claim_next → work → complete → next }
// until the backlog is empty or HQ issues stand_down.
//
// Real mode spawns a fresh Claude Code process per mission via the Claude Agent SDK,
// with the citadel MCP server attached (citadel_* tools). --dry-run exercises the
// loop without Claude (auto-attaches a stub test_report and completes), so the
// orchestration is testable without an API key.
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { makeCitadelClient } from '../mcp/citadel'

const args = process.argv.slice(2)
const has = (f: string) => args.includes(f)
const val = (f: string, d?: string) => {
  const i = args.indexOf(f)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}

const baseUrl = val('--url', process.env.CITADEL_URL) || 'http://localhost:3000'
const license = val('--license', process.env.CITADEL_LICENSE)
const dryRun = has('--dry-run')
const maxMissions = Number.parseInt(val('--max', '0') || '0', 10) // 0 = unlimited

if (!license) {
  console.error('Provide --license <lic_…> or CITADEL_LICENSE')
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

async function workMissionWithClaude(mission: any) {
  // Fresh Claude Code process per mission, with the citadel MCP attached.
  let query: any
  try {
    ({ query } = await import('@anthropic-ai/claude-agent-sdk'))
  }
  catch {
    throw new Error('Real mode needs @anthropic-ai/claude-agent-sdk installed (npm i @anthropic-ai/claude-agent-sdk) + ANTHROPIC_API_KEY. Use --dry-run to test the loop.')
  }
  const here = dirname(fileURLToPath(import.meta.url))
  const stdioEntry = resolve(here, '../mcp/stdio.ts')
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
  log(`checked in as ${ctx.agentAlias} [${(ctx.sectors || []).join(', ')}] on ${ctx.project?.key ?? '—'} (${dryRun ? 'dry-run' : 'live'})`)

  let done = 0
  for (;;) {
    const orders = await client.api('/api/v1/agent/orders')
    if (orders.standDown) { log('stand_down received — standing down.'); break }

    const { claimed } = await client.api('/api/v1/agent/claim-next', { method: 'POST' })
    if (!claimed) { log('no claimable missions in sector — backlog drained.'); break }
    log(`claimed ${claimed.key} (${claimed.sector}/${claimed.type})`)

    try {
      if (dryRun) await workMissionDryRun(claimed)
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
