#!/usr/bin/env node
// Citadel Ops — narrated end-to-end demo. Re-seeds the DB, then drives the running
// server through the full workflow and prints a pass/fail transcript.
//
//   npm run dev                     # in one terminal (server on :3000)
//   npm run demo                    # in another  (or CITADEL_URL=… npm run demo)
import { execSync } from 'node:child_process'
import { isReachable } from '../test/http/harness'
import { runScenario } from '../test/http/scenario'

const baseUrl = process.env.CITADEL_URL || 'http://localhost:3000'

async function main() {
  if (!(await isReachable(baseUrl))) {
    console.error(`✗ No server at ${baseUrl}. Start it first (npm run dev) or set CITADEL_URL.`)
    process.exit(1)
  }

  console.error(`› Re-seeding the database for a clean slate…`)
  execSync('npm run db:seed', { stdio: 'ignore' })

  console.error(`\n  CITADEL OPS — behaviour demo @ ${baseUrl}\n`)
  const steps = await runScenario(baseUrl)

  let n = 0
  for (const s of steps) {
    n++
    const mark = s.ok ? '✓' : '✗'
    console.error(`  ${mark} ${String(n).padStart(2)}. ${s.name}`)
    console.error(`        ${s.detail}`)
  }

  const failed = steps.filter(s => !s.ok)
  console.error(`\n  ${steps.length - failed.length}/${steps.length} steps passed.\n`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => { console.error('demo failed:', e?.message ?? e); process.exit(1) })
