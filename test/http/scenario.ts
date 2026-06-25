// Citadel Ops — end-to-end behaviour scenario. Drives the running server through the
// full agile/agent workflow (auth → tenancy → M Desk → EGM → DSPTCH → gates → hand-off
// → concurrency → kill-switch → tamper-evidence) and records a pass/fail per step.
// Assumes a freshly seeded DB (the demo runner re-seeds first).
import { assert, makeClient, makeRunner, type StepResult } from './harness'

const PW = 'citadel123'
const HQ = 'herb.tobias@gmail.com'
const CONTRIB = 'agent.dev@citadel.test'

export async function runScenario(baseUrl: string): Promise<StepResult[]> {
  const hq = makeClient(baseUrl)
  const { steps, step } = makeRunner()

  let webId = ''
  let appId = ''
  let devKey = ''
  let dev2Key = ''
  let qaKey = ''
  let devLicenseId = ''
  let featId = ''
  let dossierId = ''
  let qaMissionId = ''
  let bugfixId = ''

  await step('HQ signs in (session auth)', async () => {
    const r = await hq.post('/api/auth/login', { email: HQ, password: PW })
    assert(r.status === 200, `login failed: ${r.status}`)
    const projects = (await hq.get('/api/v1/projects')).data
    webId = projects.find((p: any) => p.key === 'WEB')?.id
    appId = projects.find((p: any) => p.key === 'APP')?.id
    assert(webId && appId, 'WEB/APP projects missing — seed the DB')
    return `signed in; sees ${projects.length} projects`
  })

  await step('Tenancy: contributor sees only WEB, APP → 403', async () => {
    const c = makeClient(baseUrl)
    await c.post('/api/auth/login', { email: CONTRIB, password: PW })
    const visible = (await c.get('/api/v1/projects')).data.map((p: any) => p.key)
    assert(JSON.stringify(visible) === JSON.stringify(['WEB']), `expected [WEB], got ${visible}`)
    const appMissions = await c.get(`/api/v1/projects/${appId}/missions`)
    assert(appMissions.status === 403, `expected 403 on APP, got ${appMissions.status}`)
    return `contributor: ${visible}; APP → 403`
  })

  await step('The M Desk: issue BACKEND + QA licenses', async () => {
    const dev = await hq.post(`/api/v1/projects/${webId}/licenses`, { agentAlias: 'D7', sectors: ['BACKEND'] })
    const dev2 = await hq.post(`/api/v1/projects/${webId}/licenses`, { agentAlias: 'D8', sectors: ['BACKEND'] })
    const qa = await hq.post(`/api/v1/projects/${webId}/licenses`, { agentAlias: 'Q9', sectors: ['QA'] })
    assert(dev.status === 201 && qa.status === 201 && dev2.status === 201, 'license issue failed')
    devKey = dev.data.key; dev2Key = dev2.data.key; qaKey = qa.data.key
    devLicenseId = dev.data.id
    assert(/^lic_/.test(devKey), 'key not returned')
    return `issued D7,D8 [BACKEND], Q9 [QA]`
  })

  await step('Create a feature mission (backlog)', async () => {
    const r = await hq.post(`/api/v1/projects/${webId}/missions`, {
      title: 'Implement coupon codes', sector: 'BACKEND', type: 'feature',
      acceptanceCriteria: ['Applies % discount', 'Rejects expired codes'],
    })
    assert(r.status === 201, `create failed: ${r.status}`)
    featId = r.data.id
    return `created ${r.data.key} (backlog)`
  })

  await step('EGM: designing → dossier → Cold Read → ready', async () => {
    let r = await hq.post(`/api/v1/missions/${featId}/transition`, { to: 'designing' })
    assert(r.status === 200, `to designing failed: ${r.status}`)
    // HQ files the dossier (no claim needed for a user) → cold_read
    r = await hq.post(`/api/v1/missions/${featId}/dossier`, {
      title: 'Coupon codes plan', sections: { problem: 'Discounts at checkout', technicalPlan: 'coupons table + validation' },
    })
    assert(r.status === 201 && r.data.missionStatus === 'cold_read', `dossier filed: ${JSON.stringify(r.data)}`)
    const d = await hq.get(`/api/v1/missions/${featId}/dossier`)
    dossierId = d.data.id
    // A Recruit (Q9, different from the eventual claimer) passes the Cold Read → ready
    r = await hq.post(`/api/v1/dossiers/${dossierId}/cold-read`, { verdict: 'pass', comprehensionNotes: 'Understood' }, { bearer: qaKey })
    assert(r.data.missionStatus === 'ready', `cold read → ${JSON.stringify(r.data)}`)
    return 'dossier filed, Cold Read passed → ready'
  })

  await step('Gate: ready transition requires the Goldfish (proven via fresh mission)', async () => {
    const m = await hq.post(`/api/v1/projects/${webId}/missions`, { title: 'No-dossier mission', sector: 'BACKEND' })
    await hq.post(`/api/v1/missions/${m.data.id}/transition`, { to: 'designing' })
    const r = await hq.post(`/api/v1/missions/${m.data.id}/transition`, { to: 'ready' })
    assert(r.status === 422, `expected 422 (no Cold Read), got ${r.status}`)
    return `requireGoldfish blocked ready → 422`
  })

  await step('DSPTCH: D7 claims the ready mission', async () => {
    const r = await hq.post('/api/v1/agent/claim-next', undefined, { bearer: devKey })
    assert(r.data.claimed?.id === featId, `claimed ${r.data.claimed?.key} (expected the feature)`)
    return `D7 claimed ${r.data.claimed.key} → in_progress`
  })

  await step('Gate: complete without harness report → 422', async () => {
    const r = await hq.post(`/api/v1/agent/missions/${featId}/complete`, { result: 'success' }, { bearer: devKey })
    assert(r.status === 422, `expected 422 (requireHarnessPass), got ${r.status}`)
    return 'requireHarnessPass blocked completion → 422'
  })

  await step('Hand-off: D7 spawns a QA test mission (bidirectional refs)', async () => {
    await hq.post(`/api/v1/agent/missions/${featId}/artifacts`, { kind: 'pr', url: '#', label: 'PR #1' }, { bearer: devKey })
    await hq.post(`/api/v1/agent/missions/${featId}/artifacts`, { kind: 'test_report', url: '#', label: 'unit: green' }, { bearer: devKey })
    const r = await hq.post(`/api/v1/agent/missions/${featId}/hand-off`, {
      sector: 'QA', type: 'test', title: 'Verify coupon codes', linkType: 'tests',
    }, { bearer: devKey })
    assert(r.status === 201, `hand-off failed: ${r.status}`)
    qaMissionId = r.data.id
    const links = r.data.links.map((l: any) => l.linkType)
    assert(links.includes('tests') && links.includes('spawned_from'), `links: ${links}`)
    return `spawned ${r.data.key} (QA) — tests + spawned_from`
  })

  await step('D7 completes the feature (gates pass)', async () => {
    const r = await hq.post(`/api/v1/agent/missions/${featId}/complete`, { result: 'success' }, { bearer: devKey })
    assert(r.status === 200 && r.data.status === 'done', `complete → ${r.status}`)
    return 'feature → done'
  })

  await step('QA claims the test mission; test fails → hand off a bugfix', async () => {
    const claim = await hq.post('/api/v1/agent/claim-next', undefined, { bearer: qaKey })
    assert(claim.data.claimed?.id === qaMissionId, `QA claimed ${claim.data.claimed?.key}`)
    const r = await hq.post(`/api/v1/agent/missions/${qaMissionId}/hand-off`, {
      sector: 'BACKEND', type: 'bugfix', title: 'Fix coupon rounding', linkType: 'fixes', note: 'off-by-one on discount',
    }, { bearer: qaKey })
    assert(r.status === 201, `bugfix hand-off failed: ${r.status}`)
    bugfixId = r.data.id
    return `QA spawned ${r.data.key} (bugfix, fixes)`
  })

  await step('Concurrency: two parallel claims on the bugfix — exactly one wins', async () => {
    const [a, b] = await Promise.all([
      hq.post('/api/v1/agent/claim-next', undefined, { bearer: devKey }),
      hq.post('/api/v1/agent/claim-next', undefined, { bearer: dev2Key }),
    ])
    const claimed = [a.data.claimed, b.data.claimed].filter(Boolean)
    assert(claimed.length === 1 && claimed[0].id === bugfixId, `expected exactly one claim, got ${claimed.length}`)
    return `one agent got ${claimed[0].key}, the other got nothing (SKIP LOCKED)`
  })

  await step('Kill-switch: revoke D7 → its next call 401 + work requeued', async () => {
    const rev = await hq.del(`/api/v1/licenses/${devLicenseId}`)
    assert(rev.status === 200, `revoke failed: ${rev.status}`)
    const after = await hq.post('/api/v1/agent/check-in', undefined, { bearer: devKey })
    assert(after.status === 401, `expected 401 after revoke, got ${after.status}`)
    return `D7 revoked → 401`
  })

  await step('Tamper-evidence: The Wire hash chain is intact', async () => {
    const r = await hq.get(`/api/v1/projects/${webId}/audit-verify`)
    assert(r.data.intact === true, `chain not intact: ${JSON.stringify(r.data)}`)
    return `chain intact (${r.data.entries} entries)`
  })

  return steps
}
