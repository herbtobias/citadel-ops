// HTTP scenario test — drives the full workflow against a running server. Opt-in:
// set CITADEL_URL (e.g. http://localhost:3000) with the server up + DB seeded.
//   CITADEL_URL=http://localhost:3000 npm run test:http
import { execSync } from 'node:child_process'
import { beforeAll, describe, expect, it } from 'vitest'
import type { StepResult } from './harness'
import { runScenario } from './scenario'

const URL = process.env.CITADEL_URL
const run = !!URL

let steps: StepResult[] = []

beforeAll(async () => {
  if (!run) return
  // Deterministic slate: re-seed before driving the scenario.
  execSync('npm run db:seed', { stdio: 'ignore' })
  steps = await runScenario(URL!)
}, 60_000)

describe.skipIf(!run)('HTTP behaviour scenario (requires CITADEL_URL + seeded server)', () => {
  it('every workflow step passes', () => {
    const failed = steps.filter(s => !s.ok)
    if (failed.length) {
      throw new Error(`failed steps:\n${failed.map(s => `  ✗ ${s.name}: ${s.detail}`).join('\n')}`)
    }
    expect(steps.length).toBeGreaterThan(10)
  })
})
