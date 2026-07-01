// Citadel Ops — end-to-end behaviour scenario. Drives the running server through the
// full agile/agent workflow (auth → tenancy → M Desk → Cold Read → DSPTCH → gates → hand-off
// → concurrency → kill-switch → tamper-evidence) and records a pass/fail per step.
// Assumes a freshly seeded DB (the demo runner re-seeds first).
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../server/db'
import { assert, makeClient, makeRunner, type StepResult } from './harness'

const PW = 'citadel123'
const HQ = 'hq@citadel.test'
const CONTRIB = 'agent.dev@citadel.test'
const MANAGER = 'manager@citadel.test'

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
  let scoutKey = ''

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
    const dev = await hq.post(`/api/v1/projects/${webId}/licenses`, {
      agentAlias: 'D7',
      sectors: ['BACKEND'],
    })
    const dev2 = await hq.post(`/api/v1/projects/${webId}/licenses`, {
      agentAlias: 'D8',
      sectors: ['BACKEND'],
    })
    const qa = await hq.post(`/api/v1/projects/${webId}/licenses`, {
      agentAlias: 'Q9',
      sectors: ['QA'],
    })
    assert(dev.status === 201 && qa.status === 201 && dev2.status === 201, 'license issue failed')
    devKey = dev.data.key
    dev2Key = dev2.data.key
    qaKey = qa.data.key
    devLicenseId = dev.data.id
    assert(/^lic_/.test(devKey), 'key not returned')
    return `issued D7,D8 [BACKEND], Q9 [QA]`
  })

  await step('Acquire handshake: provisioning key mints a scoped session license', async () => {
    // Issue a provisioning key (BACKEND+QA ceiling, recon scope ceiling).
    const key = await hq.post(`/api/v1/projects/${webId}/licenses`, {
      agentAlias: 'KEYX',
      sectors: ['BACKEND', 'QA'],
      scopes: ['recon'],
      kind: 'provisioning',
    })
    assert(key.status === 201 && key.data.kind === 'provisioning', 'provisioning issue failed')
    const provKey = key.data.key

    // Per (project, owner): this manager already has one here → a second is 409 (rotate instead).
    const dup = await hq.post(`/api/v1/projects/${webId}/licenses`, {
      agentAlias: 'KEYX2',
      sectors: ['BACKEND'],
      kind: 'provisioning',
    })
    assert(dup.status === 409, `second provisioning key for same M should 409, got ${dup.status}`)

    // A provisioning key cannot do work directly — it may only mint.
    const work = await hq.post('/api/v1/agent/check-in', undefined, { bearer: provKey })
    assert(work.status === 403, `provisioning key should 403 on work, got ${work.status}`)

    // Acquire a BACKEND session license from it.
    const acq = await hq.post(
      '/api/v1/agent/acquire',
      { sectors: ['BACKEND'] },
      { bearer: provKey },
    )
    assert(
      acq.status === 201 &&
        /^lic_/.test(acq.data.key) &&
        JSON.stringify(acq.data.sectors) === JSON.stringify(['BACKEND']),
      `acquire → ${JSON.stringify(acq.data)}`,
    )
    const sessionKey = acq.data.key

    // The session license works (check-in → 200).
    const ci = await hq.post('/api/v1/agent/check-in', undefined, { bearer: sessionKey })
    assert(ci.status === 200, `session check-in → ${ci.status}`)

    // It cannot exceed the provisioning ceiling (INFRA is outside BACKEND+QA).
    const over = await hq.post('/api/v1/agent/acquire', { sectors: ['INFRA'] }, { bearer: provKey })
    assert(over.status === 403, `acquire beyond ceiling should 403, got ${over.status}`)

    // Cascade kill-switch: revoking the provisioning key revokes its session children.
    const rev = await hq.del(`/api/v1/licenses/${key.data.id}`)
    assert(
      rev.status === 200 && rev.data.sessionsRevoked >= 1,
      `revoke cascade → ${JSON.stringify(rev.data)}`,
    )
    const dead = await hq.post('/api/v1/agent/check-in', undefined, { bearer: sessionKey })
    assert(dead.status === 401, `session should be dead after parent revoke, got ${dead.status}`)
    return 'provisioning mints scoped session; ceiling enforced; revoke cascades'
  })

  await step('Brownfield onboarding: recon scope gates Archive writes', async () => {
    // A plain BACKEND license (no recon scope) is 403'd on the Archive write.
    const denied = await hq.post(
      '/api/v1/agent/knowledge',
      { path: 'README', summary: 'should be blocked' },
      { bearer: devKey },
    )
    assert(denied.status === 403, `expected 403 without recon, got ${denied.status}`)

    // Issue a Scout (recon scope) and write a KnowledgeDoc into The Archive.
    const scout = await hq.post(`/api/v1/projects/${webId}/licenses`, {
      agentAlias: 'S1',
      sectors: ['BACKEND'],
      scopes: ['recon'],
    })
    assert(scout.status === 201 && scout.data.scopes.includes('recon'), 'scout license failed')
    scoutKey = scout.data.key
    const wrote = await hq.post(
      '/api/v1/agent/knowledge',
      { path: 'server/api', level: 1, summary: 'Nitro routes', bodyMarkdown: '## API\nendpoints.' },
      { bearer: scout.data.key },
    )
    assert(
      wrote.status === 201 && wrote.data.created === true,
      `write → ${JSON.stringify(wrote.data)}`,
    )

    // §SENTINEL: the write lands QUARANTINED — an agent read (certified-only) does NOT see it.
    const agentRead = await hq.get('/api/v1/agent/knowledge', { bearer: scout.data.key })
    assert(
      !agentRead.data.some((d: any) => d.path === 'server/api'),
      'quarantined doc leaked into the agent read (poisoning risk)',
    )

    // HQ sees it in the quarantine queue (all statuses) as `quarantined`.
    const hqArchive = await hq.get(`/api/v1/projects/${webId}/knowledge`)
    const hqDoc = hqArchive.data.find((d: any) => d.path === 'server/api')
    assert(
      hqArchive.status === 200 &&
        hqDoc?.status === 'quarantined' &&
        hqDoc?.bodyMarkdown?.includes('endpoints.'),
      `HQ quarantine view wrong: ${JSON.stringify(hqDoc)}`,
    )

    // Zero-context: the AUTHOR License cannot certify its own doc (403).
    const selfCert = await hq.post(
      `/api/v1/knowledge/${hqDoc.id}/verify`,
      { verdict: 'certify' },
      { bearer: scout.data.key },
    )
    assert(selfCert.status === 403, `author self-certify should 403, got ${selfCert.status}`)

    // HQ (foreign actor) certifies → the doc now reaches the agent read/Briefing.
    const cert = await hq.post(`/api/v1/knowledge/${hqDoc.id}/verify`, {
      verdict: 'certify',
      notes: 'verified against the repo',
    })
    assert(
      cert.status === 200 && cert.data.status === 'certified',
      `certify → ${JSON.stringify(cert.data)}`,
    )
    const agentRead2 = await hq.get('/api/v1/agent/knowledge', { bearer: scout.data.key })
    assert(
      agentRead2.data.some(
        (d: any) => d.path === 'server/api' && d.bodyMarkdown?.includes('endpoints.'),
      ),
      'certified doc missing from the agent read',
    )

    // Poisoning defense: a rejected fact never reaches an agent. Write → reject → still hidden.
    await hq.post(
      '/api/v1/agent/knowledge',
      { path: 'INTEL/poison', summary: 'a false claim', bodyMarkdown: 'wrong.' },
      { bearer: scout.data.key },
    )
    const poison = (
      await hq.get(`/api/v1/projects/${webId}/knowledge?status=quarantined`)
    ).data.find((d: any) => d.path === 'INTEL/poison')
    const rej = await hq.post(`/api/v1/knowledge/${poison.id}/verify`, {
      verdict: 'reject',
      reason: 'unverifiable',
    })
    assert(
      rej.status === 200 && rej.data.status === 'rejected',
      `reject → ${JSON.stringify(rej.data)}`,
    )
    const agentRead3 = await hq.get('/api/v1/agent/knowledge', { bearer: scout.data.key })
    assert(
      !agentRead3.data.some((d: any) => d.path === 'INTEL/poison'),
      'rejected poison leaked into the agent read',
    )

    // Finishing the recon run raises exactly ONE archive_updated notification for HQ
    // (not a bell per doc). Leiter writes it async off the event bus — poll briefly.
    const fin = await hq.post('/api/v1/agent/knowledge/finish', {}, { bearer: scout.data.key })
    assert(fin.status === 200 && fin.data.docCount >= 1, `finish → ${JSON.stringify(fin.data)}`)
    let notified = false
    for (let i = 0; i < 20 && !notified; i++) {
      const notifs = await hq.get('/api/v1/notifications?limit=20')
      notified = (notifs.data.notifications ?? []).some((n: any) => n.type === 'archive_updated')
      if (!notified) await new Promise((r) => setTimeout(r, 100))
    }
    assert(notified, 'no archive_updated notification after finish_recon')
    return `recon gated; Scout filed → Archive (agent + HQ read); finish → 1 notification`
  })

  await step('Deletion: agent retracts a doc; manager purges INTEL/ subtree', async () => {
    // The Scout retracts the doc it filed (recon scope).
    const ret = await hq.del('/api/v1/agent/knowledge?path=server/api', { bearer: scoutKey })
    assert(ret.status === 200 && ret.data.deleted === 1, `retract → ${JSON.stringify(ret.data)}`)
    const after = await hq.get('/api/v1/agent/knowledge', { bearer: scoutKey })
    assert(!after.data.some((d: any) => d.path === 'server/api'), 'doc still present after retract')

    // HQ purges the seeded INTEL/ subtree (manager, by prefix).
    const purge = await hq.del(`/api/v1/projects/${webId}/knowledge?prefix=INTEL/`)
    assert(purge.status === 200 && purge.data.deleted >= 1, `purge → ${JSON.stringify(purge.data)}`)
    const briefing = await hq.get(`/api/v1/projects/${webId}/briefing`)
    const hasIntel = briefing.data.archive.knowledge.some((k: any) => k.path.startsWith('INTEL/'))
    assert(!hasIntel, 'INTEL/ still in briefing after purge')
    return `agent retracted server/api; HQ purged INTEL/* (${purge.data.deleted})`
  })

  await step('Purge: disposable project deletes with cascade (confirm-gated)', async () => {
    const orgs = await hq.get('/api/v1/organizations')
    const orgId = orgs.data.find((o: any) => o.slug === 'hq')?.id
    assert(orgId, 'hq org not found')
    const p = await hq.post(`/api/v1/organizations/${orgId}/projects`, {
      key: 'TMP',
      name: 'Disposable',
      sectors: ['BACKEND'],
    })
    assert(p.status === 201, `create temp project → ${p.status}: ${JSON.stringify(p.data)}`)
    const tmpId = p.data.id
    // Wrong/absent confirm is refused.
    const noConfirm = await hq.del(`/api/v1/projects/${tmpId}`)
    assert(noConfirm.status === 422, `expected 422 without confirm, got ${noConfirm.status}`)
    // Correct confirm purges it.
    const del = await hq.del(`/api/v1/projects/${tmpId}?confirm=TMP`)
    assert(
      del.status === 200 && del.data.purged.project === 'TMP',
      `purge → ${JSON.stringify(del.data)}`,
    )
    const gone = await hq.get(`/api/v1/projects/${tmpId}/missions`)
    assert(gone.status === 404 || gone.status === 403, `project still reachable: ${gone.status}`)
    return `created TMP, blocked w/o confirm, purged with ?confirm=TMP`
  })

  await step('Create a feature mission (backlog)', async () => {
    const r = await hq.post(`/api/v1/projects/${webId}/missions`, {
      title: 'Implement coupon codes',
      sector: 'BACKEND',
      type: 'feature',
      acceptanceCriteria: ['Applies % discount', 'Rejects expired codes'],
    })
    assert(r.status === 201, `create failed: ${r.status}`)
    featId = r.data.id
    return `created ${r.data.key} (backlog)`
  })

  await step('Archive: designing → dossier → Cold Read → ready', async () => {
    let r = await hq.post(`/api/v1/missions/${featId}/transition`, { to: 'designing' })
    assert(r.status === 200, `to designing failed: ${r.status}`)
    // HQ files the dossier (no claim needed for a user) → cold_read
    r = await hq.post(`/api/v1/missions/${featId}/dossier`, {
      title: 'Coupon codes plan',
      sections: { problem: 'Discounts at checkout', technicalPlan: 'coupons table + validation' },
    })
    assert(
      r.status === 201 && r.data.missionStatus === 'cold_read',
      `dossier filed: ${JSON.stringify(r.data)}`,
    )
    const d = await hq.get(`/api/v1/missions/${featId}/dossier`)
    dossierId = d.data.id
    // A Recruit (Q9, different from the eventual claimer) passes the Cold Read → ready
    r = await hq.post(
      `/api/v1/dossiers/${dossierId}/cold-read`,
      { verdict: 'pass', comprehensionNotes: 'Understood' },
      { bearer: qaKey },
    )
    assert(r.data.missionStatus === 'ready', `cold read → ${JSON.stringify(r.data)}`)
    return 'dossier filed, Cold Read passed → ready'
  })

  await step(
    'Gate: ready transition requires the Cold Read (proven via fresh mission)',
    async () => {
      const m = await hq.post(`/api/v1/projects/${webId}/missions`, {
        title: 'No-dossier mission',
        sector: 'BACKEND',
      })
      await hq.post(`/api/v1/missions/${m.data.id}/transition`, { to: 'designing' })
      const r = await hq.post(`/api/v1/missions/${m.data.id}/transition`, { to: 'ready' })
      assert(r.status === 422, `expected 422 (no Cold Read), got ${r.status}`)
      return `requireColdRead blocked ready → 422`
    },
  )

  await step('DSPTCH: D7 claims the ready mission', async () => {
    const r = await hq.post('/api/v1/agent/claim-next', undefined, { bearer: devKey })
    assert(r.data.claimed?.id === featId, `claimed ${r.data.claimed?.key} (expected the feature)`)
    return `D7 claimed ${r.data.claimed.key} → in_progress`
  })

  await step('Gate: complete without harness report → 422', async () => {
    const r = await hq.post(
      `/api/v1/agent/missions/${featId}/complete`,
      { result: 'success' },
      { bearer: devKey },
    )
    assert(r.status === 422, `expected 422 (requireHarnessPass), got ${r.status}`)
    return 'requireHarnessPass blocked completion → 422'
  })

  await step('Hand-off: D7 spawns a QA test mission (bidirectional refs)', async () => {
    await hq.post(
      `/api/v1/agent/missions/${featId}/artifacts`,
      { kind: 'pr', url: '#', label: 'PR #1' },
      { bearer: devKey },
    )
    await hq.post(
      `/api/v1/agent/missions/${featId}/artifacts`,
      { kind: 'test_report', url: '#', label: 'unit: green' },
      { bearer: devKey },
    )
    const r = await hq.post(
      `/api/v1/agent/missions/${featId}/hand-off`,
      {
        sector: 'QA',
        type: 'test',
        title: 'Verify coupon codes',
        linkType: 'tests',
      },
      { bearer: devKey },
    )
    assert(r.status === 201, `hand-off failed: ${r.status}`)
    qaMissionId = r.data.id
    const links = r.data.links.map((l: any) => l.linkType)
    assert(links.includes('tests') && links.includes('spawned_from'), `links: ${links}`)
    return `spawned ${r.data.key} (QA) — tests + spawned_from`
  })

  await step('D7 completes the feature (gates pass)', async () => {
    const r = await hq.post(
      `/api/v1/agent/missions/${featId}/complete`,
      { result: 'success' },
      { bearer: devKey },
    )
    assert(r.status === 200 && r.data.status === 'done', `complete → ${r.status}`)
    return 'feature → done'
  })

  await step('QA claims the test mission; test fails → hand off a bugfix', async () => {
    const claim = await hq.post('/api/v1/agent/claim-next', undefined, { bearer: qaKey })
    assert(claim.data.claimed?.id === qaMissionId, `QA claimed ${claim.data.claimed?.key}`)
    const r = await hq.post(
      `/api/v1/agent/missions/${qaMissionId}/hand-off`,
      {
        sector: 'BACKEND',
        type: 'bugfix',
        title: 'Fix coupon rounding',
        linkType: 'fixes',
        note: 'off-by-one on discount',
      },
      { bearer: qaKey },
    )
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
    assert(
      claimed.length === 1 && claimed[0].id === bugfixId,
      `expected exactly one claim, got ${claimed.length}`,
    )
    return `one agent got ${claimed[0].key}, the other got nothing (SKIP LOCKED)`
  })

  await step(
    'PARLEY: agent asks HQ → waiting_human → answer → resume (over the dossier)',
    async () => {
      // Fresh agent so it doesn't collide with the concurrency winners.
      const p8 = await hq.post(`/api/v1/projects/${webId}/licenses`, {
        agentAlias: 'P8',
        sectors: ['BACKEND'],
      })
      const p8Key = p8.data.key
      // Urgent mission groomed to ready via the Cold Read, so claim-next picks it first.
      const mk = await hq.post(`/api/v1/projects/${webId}/missions`, {
        title: 'Ambiguous requirement — needs a human call',
        sector: 'BACKEND',
        type: 'feature',
        priority: 'urgent',
      })
      const pmId = mk.data.id
      await hq.post(`/api/v1/missions/${pmId}/transition`, { to: 'designing' })
      await hq.post(`/api/v1/missions/${pmId}/dossier`, {
        title: 'plan',
        sections: { problem: 'discount kind unclear', technicalPlan: 'ask HQ' },
      })
      const dz = await hq.get(`/api/v1/missions/${pmId}/dossier`)
      await hq.post(
        `/api/v1/dossiers/${dz.data.id}/cold-read`,
        { verdict: 'pass', comprehensionNotes: 'ok' },
        { bearer: qaKey },
      )
      const claim = await hq.post('/api/v1/agent/claim-next', undefined, { bearer: p8Key })
      assert(
        claim.data.claimed?.id === pmId,
        `P8 claimed ${claim.data.claimed?.key} (expected PARLEY)`,
      )

      // Agent asks HQ → durable suspension.
      const ask = await hq.post(
        `/api/v1/agent/missions/${pmId}/request-human-input`,
        { question: 'Percent or fixed discount?', options: { format: 'yes_no' } },
        { bearer: p8Key },
      )
      assert(
        ask.status === 200 && ask.data.status === 'waiting_human',
        `ask → ${JSON.stringify(ask.data)}`,
      )
      const parked = await hq.get(`/api/v1/missions/${pmId}`)
      assert(parked.data.status === 'waiting_human', `not parked: ${parked.data.status}`)

      // A parked mission is NOT claimable (no lease/requeue) — a fresh claim finds nothing new.
      const noClaim = await hq.post('/api/v1/agent/claim-next', undefined, { bearer: p8Key })
      assert(
        noClaim.data.claimed == null,
        `waiting_human leaked into claim-next: ${JSON.stringify(noClaim.data.claimed)}`,
      )

      // HQ answers → re-queued to ready; the answer is in the dossier for the resuming agent.
      const ans = await hq.post(`/api/v1/missions/${pmId}/answer-human-input`, {
        answer: 'Percent discount.',
      })
      assert(
        ans.status === 200 && ans.data.status === 'ready',
        `answer → ${JSON.stringify(ans.data)}`,
      )
      const dz2 = await hq.get(`/api/v1/missions/${pmId}/dossier`)
      const addenda = dz2.data.sections?.addenda ?? []
      assert(
        (await hq.get(`/api/v1/missions/${pmId}`)).data.status === 'ready' &&
          addenda.some((a: any) => a.kind === 'human_question') &&
          addenda.some((a: any) => a.kind === 'human_answer' && a.body.includes('Percent')),
        `resume/answer not in dossier: ${JSON.stringify(addenda)}`,
      )
      return 'ask → waiting_human (unclaimable) → HQ answer → ready, Q+A in the dossier'
    },
  )

  await step('Kill-switch: revoke D7 → its next call 401 + work requeued', async () => {
    const rev = await hq.del(`/api/v1/licenses/${devLicenseId}`)
    assert(rev.status === 200, `revoke failed: ${rev.status}`)
    const after = await hq.post('/api/v1/agent/check-in', undefined, { bearer: devKey })
    assert(after.status === 401, `expected 401 after revoke, got ${after.status}`)
    return `D7 revoked → 401`
  })

  await step('Robustness: a malformed :id is rejected at the boundary (400, not 500)', async () => {
    // Feeding a non-uuid straight into eq(table.id, id) makes Postgres throw 22P02
    // (string_to_uuid) → an unhandled 500. The route boundary must catch it first.
    const bad = 'not-a-uuid'
    const project = await hq.get(`/api/v1/projects/${bad}`)
    const mission = await hq.get(`/api/v1/missions/${bad}`)
    const projMissions = await hq.get(`/api/v1/projects/${bad}/missions`)
    const dossier = await hq.post(
      `/api/v1/dossiers/${bad}/cold-read`,
      { verdict: 'pass' },
      { bearer: qaKey },
    )
    for (const [name, r] of [
      ['GET project', project],
      ['GET mission', mission],
      ['GET project missions', projMissions],
      ['POST cold-read', dossier],
    ] as const) {
      assert(r.status !== 500, `${name}: malformed id surfaced as 500 (expected 400/404)`)
      assert(r.status === 400 || r.status === 404, `${name}: expected 400/404, got ${r.status}`)
    }
    // A well-formed-but-unknown uuid still resolves cleanly to 404 (not 400).
    const unknownUuid = '00000000-0000-4000-8000-000000000000'
    const missing = await hq.get(`/api/v1/projects/${unknownUuid}`)
    assert(missing.status === 404, `unknown uuid should 404, got ${missing.status}`)
    return `malformed id → 400; unknown uuid → 404`
  })

  await step('Tamper-evidence: The Wire hash chain is intact', async () => {
    const r = await hq.get(`/api/v1/projects/${webId}/audit-verify`)
    assert(r.data.intact === true, `chain not intact: ${JSON.stringify(r.data)}`)
    return `chain intact (${r.data.entries} entries)`
  })

  await step('Auth: login throttles after repeated failures (429)', async () => {
    const a = makeClient(baseUrl)
    const codes: number[] = []
    for (let i = 0; i < 11; i++) {
      const r = await a.post('/api/auth/login', { email: 'throttle@test.invalid', password: 'x' })
      codes.push(r.status)
    }
    assert(
      codes.slice(0, 10).every((c) => c === 401) && codes[10] === 429,
      `expected 10×401 then 429, got ${codes.join(',')}`,
    )
    return `10×401 → 429 (throttled)`
  })

  await step('Auth: forgot-password does not enumerate accounts', async () => {
    const a = makeClient(baseUrl)
    const unknown = await a.post('/api/auth/forgot-password', { email: 'nobody@example.com' })
    const known = await a.post('/api/auth/forgot-password', { email: MANAGER })
    assert(
      unknown.status === 200 && known.status === 200,
      `expected 200/200, got ${unknown.status}/${known.status}`,
    )
    return `unknown + known email both → 200`
  })

  await step('Auth: reset-password is single-use, expiring, and changes the password', async () => {
    const a = makeClient(baseUrl)
    const [mgr] = await db.select().from(schema.users).where(eq(schema.users.email, MANAGER))
    assert(!!mgr, 'manager user missing')
    const token = `reset_${'a'.repeat(40)}`
    const tokenHash = createHash('sha256').update(token).digest('hex')
    await db.insert(schema.passwordResetTokens).values({
      userId: mgr!.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })

    const reset = await a.post('/api/auth/reset-password', { token, password: 'newpass12345' })
    assert(reset.status === 200, `reset → ${reset.status}`)
    const reuse = await a.post('/api/auth/reset-password', { token, password: 'other12345' })
    assert(reuse.status === 400, `reused token should 400, got ${reuse.status}`)

    const ok = await a.post('/api/auth/login', { email: MANAGER, password: 'newpass12345' })
    const old = await makeClient(baseUrl).post('/api/auth/login', { email: MANAGER, password: PW })
    assert(ok.status === 200 && old.status === 401, `new=${ok.status} old=${old.status}`)
    return `token single-use; password changed (old → 401)`
  })

  return steps
}
