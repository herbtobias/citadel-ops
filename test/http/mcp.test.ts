// MCP integration — drives the citadel tools against the running server (the tools
// proxy the REST API). Opt-in: set CITADEL_URL with the server up. Re-seeds so the
// demo license lic_006_demo (FRONTEND/DESIGN) exists.
import { execSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connectInMemory } from '../mcp-util'

const URL = process.env.CITADEL_URL
const run = !!URL

let client: any

beforeAll(async () => {
  if (!run) return
  execSync('npm run db:seed', { stdio: 'ignore' })
  client = await connectInMemory({ baseUrl: URL!, license: 'lic_006_demo' })
}, 60_000)

afterAll(async () => {
  await client?.close()
})

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const res = await client.callTool({ name, arguments: args })
  return JSON.parse(res.content[0].text)
}

describe.skipIf(!run)('MCP citadel tools → REST (requires CITADEL_URL + seeded server)', () => {
  it('acquire_license returns the agent context', async () => {
    const ctx = await call('citadel_acquire_license')
    expect(ctx.agentAlias).toBe('006')
    expect(ctx.sectors).toEqual(expect.arrayContaining(['FRONTEND', 'DESIGN']))
    expect(ctx.project.key).toBe('WEB')
  })

  it('get_briefing returns layered project intel', async () => {
    const b = await call('citadel_get_briefing')
    expect(b.operation.codename).toBe('Operation Nightfall')
    expect(b.qBranch.qualityGates.length).toBeGreaterThan(0)
    expect(b.archive.knowledge.length).toBeGreaterThan(0)
  })

  it('claim_next_mission claims a ready mission in the license sector', async () => {
    const r = await call('citadel_claim_next_mission')
    expect(r.claimed?.key).toBe('WEB-44') // the seeded ready FRONTEND mission
    expect(r.claimed.sector).toBe('FRONTEND')
  })

  it('surfaces REST errors as tool errors (not crashes)', async () => {
    const res = await client.callTool({
      name: 'citadel_get_mission',
      arguments: { missionId: 'not-a-uuid' },
    })
    expect(res.isError).toBe(true)
  })
})
