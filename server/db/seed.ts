// Citadel Ops — demo seed. Idempotent: wipes the demo org and rebuilds it.
// Run with `npm run db:seed` (tsx). Mirrors app/composables/useMockData.ts so the
// HQ board renders the same hand-off chain from real data.
import { createHash } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { db, schema } from './index'
import { hashPassword } from '../utils/password'
import { logActivity } from '../utils/activity'
import { createBidirectional } from '../utils/references'
import type { ProjectSettings } from './schema'

const {
  users,
  organizations,
  orgMemberships,
  projectMemberships,
  projects,
  themes,
  designGuidelines,
  qualityGates,
  harnessDefs,
  operations,
  missions,
  references,
  licenses,
  artifacts,
  dossiers,
  knowledgeDocs,
} = schema

// All seeded users share this dev password.
const DEV_PASSWORD = 'citadel123'

// Simple deterministic key hash for the seed (P3 swaps in argon2).
const hashKey = (k: string) => createHash('sha256').update(k).digest('hex')

async function seed() {
  // Safety: the seed WIPES the demo org + demo users and installs publicly-known
  // credentials (lic_*_demo, password "citadel123"). Refuse to run against a
  // production database unless explicitly overridden.
  if (process.env.NODE_ENV === 'production' && process.env.CITADEL_ALLOW_SEED !== 'true') {
    throw new Error(
      'Refusing to seed in production (would wipe data + install demo credentials). ' +
        'Set CITADEL_ALLOW_SEED=true only if you truly intend this.',
    )
  }

  const ORG_SLUG = 'hq'
  console.log('› Seeding Citadel Ops demo data…')

  const HQ_EMAIL = 'hq@citadel.test'
  const MANAGER_EMAIL = 'manager@citadel.test'
  const CONTRIB_EMAIL = 'agent.dev@citadel.test'
  const VIEWER_EMAIL = 'observer@citadel.test'
  const ALL_EMAILS = [HQ_EMAIL, MANAGER_EMAIL, CONTRIB_EMAIL, VIEWER_EMAIL]

  // Wipe any prior demo org (cascade clears everything below it), then the
  // platform-global demo users (not covered by the org cascade).
  const [existing] = await db.select().from(organizations).where(eq(organizations.slug, ORG_SLUG))
  if (existing) {
    await db.delete(organizations).where(eq(organizations.id, existing.id))
    console.log('  cleared previous demo org')
  }
  await db.delete(users).where(inArray(users.email, ALL_EMAILS))

  // ── Users (password = "citadel123" for all) ──
  const pw = hashPassword(DEV_PASSWORD)
  const [hq] = await db
    .insert(users)
    .values({
      email: HQ_EMAIL,
      name: 'HQ',
      passwordHash: pw,
      systemRole: 'super_admin',
    })
    .returning()
  const [manager] = await db
    .insert(users)
    .values({
      email: MANAGER_EMAIL,
      name: 'Moneypenny',
      passwordHash: pw,
      systemRole: 'user',
    })
    .returning()
  const [contrib] = await db
    .insert(users)
    .values({
      email: CONTRIB_EMAIL,
      name: 'Agent Dev',
      passwordHash: pw,
      systemRole: 'user',
    })
    .returning()
  const [viewer] = await db
    .insert(users)
    .values({
      email: VIEWER_EMAIL,
      name: 'Observer',
      passwordHash: pw,
      systemRole: 'user',
    })
    .returning()

  // ── Organization + membership ──
  const [org] = await db
    .insert(organizations)
    .values({
      name: 'Citadel HQ',
      slug: ORG_SLUG,
      ownerUserId: hq.id,
    })
    .returning()
  await db.insert(orgMemberships).values([
    { orgId: org.id, userId: hq.id, role: 'manager' },
    { orgId: org.id, userId: manager.id, role: 'manager' },
    { orgId: org.id, userId: contrib.id, role: 'contributor' },
    { orgId: org.id, userId: viewer.id, role: 'viewer' },
  ])

  // ── Project (WEB / Operation Website) ──
  const webSettings: ProjectSettings = {
    statusColumns: [
      'backlog',
      'designing',
      'cold_read',
      'ready',
      'in_progress',
      'in_review',
      'done',
    ],
    sectors: ['FRONTEND', 'BACKEND', 'QA', 'DESIGN'],
    coldReadRequired: true,
    activeThemeKey: 'defcon-5',
    maxHandoffDepth: 5,
    maxMissionsPerAgent: 3,
    wipLimits: { in_progress: 4 },
    rateLimits: { callsPerMin: 120 },
  }
  const [web] = await db
    .insert(projects)
    .values({
      orgId: org.id,
      key: 'WEB',
      name: 'Operation Website',
      description: 'Marketing site relaunch',
      settings: webSettings,
    })
    .returning()

  const appSettings: ProjectSettings = {
    statusColumns: ['backlog', 'designing', 'ready', 'in_progress', 'in_review', 'done'],
    sectors: ['FRONTEND', 'BACKEND', 'QA'],
    coldReadRequired: false,
    activeThemeKey: 'cyberwar',
    maxHandoffDepth: 5,
    maxMissionsPerAgent: 3,
  }
  const [mob] = await db
    .insert(projects)
    .values({
      orgId: org.id,
      key: 'APP',
      name: 'Operation Mobile',
      description: 'Companion mobile app',
      settings: appSettings,
    })
    .returning()

  // Per-project grants: contributor & viewer get WEB only (so they can't see APP);
  // managers/super_admin see all org projects implicitly.
  await db.insert(projectMemberships).values([
    { projectId: web.id, userId: contrib.id, grantedByUserId: hq.id },
    { projectId: web.id, userId: viewer.id, grantedByUserId: hq.id },
  ])

  // ── Themes (seeds, §4) ──
  await db.insert(themes).values([
    {
      orgId: org.id,
      key: 'defcon-5',
      name: 'DEFCON 5',
      isActive: true,
      tokens: { bg: '#0a0a0a', accent: '#ff3d00', radius: '0px' },
    },
    {
      orgId: org.id,
      key: 'cyberwar',
      name: 'Cyberwar',
      isActive: true,
      tokens: { bg: '#0a0a0f', accent: '#00ff88', radius: '2px' },
    },
  ])
  await db.insert(designGuidelines).values([
    {
      projectId: web.id,
      themeKey: 'defcon-5',
      title: 'DEFCON 5 Design Guideline',
      bodyMarkdown:
        'Poster design for the web. Extreme scale contrast, radius 0, underline buttons. Consume semantic tokens only.',
    },
    {
      projectId: mob.id,
      themeKey: 'cyberwar',
      title: 'Cyberwar Design Guideline',
      bodyMarkdown:
        'Neon HUD. Soft accents, chamfered corners, subtle scanlines — keep text legible. Semantic tokens only.',
    },
  ])

  // ── Q-Branch: gates + harness ──
  await db.insert(qualityGates).values([
    {
      projectId: web.id,
      key: 'ready-gate',
      name: 'Cold Read before Ready',
      appliesToStatus: 'ready',
      rule: { requireColdRead: true },
      blocking: true,
    },
    {
      projectId: web.id,
      key: 'done-gate',
      name: 'Harness + artifacts before Done',
      appliesToStatus: 'done',
      rule: { requireHarnessPass: true, requireArtifacts: true, requireAcceptanceChecked: true },
      blocking: true,
    },
  ])
  await db.insert(harnessDefs).values({
    projectId: web.id,
    key: 'default',
    name: 'Default harness',
    commands: { build: 'npm run build', test: 'npm run test', lint: 'npm run lint' },
  })

  // ── The Archive: knowledge docs (layered summaries) ──
  // The Archive — what a Scout would have filed after recon of an existing repo
  // (summaries = "peanuts & hay", bodyMarkdown = the deep read), plus an INTEL/ doc
  // as the Interrogator would persist it after debriefing the operator.
  await db.insert(knowledgeDocs).values([
    {
      projectId: web.id,
      path: 'README',
      level: 0,
      summary: 'Marketing site relaunch — Nuxt 4, editorial design, pricing + checkout flow.',
      bodyMarkdown: [
        '# WEB — Marketing site relaunch',
        '',
        '**Stack:** Nuxt 4, Vue 3, Tailwind v4 (semantic tokens), Pinia, @nuxtjs/i18n (EN/DE).',
        '**Shape:** SSR marketing site + a small Nitro API for pricing and (planned) checkout.',
        '**Build/test:** `npm run dev`, `npm run build`, `npm run test` (vitest).',
        '',
        'See `server/` and `app/` for the two halves.',
      ].join('\n'),
    },
    {
      projectId: web.id,
      path: 'server/',
      level: 1,
      summary: 'Nitro API: pricing endpoint, checkout integration (planned).',
      bodyMarkdown: [
        '## server/ — Nitro API',
        '',
        '- `GET /api/pricing` returns the 3 tiers (the only live endpoint).',
        '- Checkout (Stripe) is **planned, not built** — the biggest open area.',
        '- No auth layer yet; endpoints are public.',
      ].join('\n'),
    },
    {
      projectId: web.id,
      path: 'app/',
      level: 1,
      summary: 'Vue pages + components; semantic-token theming (DEFCON 5 active).',
      bodyMarkdown: [
        '## app/ — Vue front-end',
        '',
        '- Pages + components consume **semantic tokens only** (no hard-coded colors).',
        '- i18n strings live in `i18n/locales/{en,de}.json`.',
        '- Theming via `[data-theme]`; DEFCON 5 is the active theme.',
      ].join('\n'),
    },
    {
      projectId: web.id,
      path: 'INTEL/constraints',
      level: 0,
      summary: 'Operator debrief: launch deadline, GDPR/EU residency, no checkout downtime.',
      bodyMarkdown: [
        '## INTEL — Constraints (from operator debrief)',
        '',
        '- **Deadline:** public relaunch must ship before the autumn campaign.',
        '- **Compliance:** EU data residency + GDPR; no PII in logs.',
        '- **Risk area:** checkout must not regress existing pricing display.',
        '- **Convention:** all copy is bilingual (EN/DE) — never ship EN-only strings.',
      ].join('\n'),
    },
  ])

  // ── Licenses (agents) ──
  const [lic007] = await db
    .insert(licenses)
    .values({
      orgId: org.id,
      projectId: web.id,
      agentAlias: '007',
      hashedKey: hashKey('lic_007_demo'),
      sectors: ['BACKEND'],
      status: 'active',
      lastSeenAt: new Date('2026-06-25T09:40:00Z'),
    })
    .returning()
  const [lic009] = await db
    .insert(licenses)
    .values({
      orgId: org.id,
      projectId: web.id,
      agentAlias: '009',
      hashedKey: hashKey('lic_009_demo'),
      sectors: ['QA'],
      status: 'active',
      lastSeenAt: new Date('2026-06-25T09:38:00Z'),
    })
    .returning()
  const [lic006] = await db
    .insert(licenses)
    .values({
      orgId: org.id,
      projectId: web.id,
      agentAlias: '006',
      hashedKey: hashKey('lic_006_demo'),
      sectors: ['FRONTEND', 'DESIGN'],
      status: 'active',
      lastSeenAt: new Date('2026-06-25T08:10:00Z'),
    })
    .returning()
  // A Planner: the `plan` scope lets it create & groom Operations/Missions upstream
  // of execution (plus BACKEND, so it can also work what it plans).
  await db.insert(licenses).values({
    orgId: org.id,
    projectId: web.id,
    agentAlias: '008',
    hashedKey: hashKey('lic_008_demo'),
    sectors: ['BACKEND'],
    scopes: ['plan'],
    status: 'active',
    lastSeenAt: new Date('2026-06-25T08:05:00Z'),
  })
  // A Scout/Interrogator: the `recon` scope lets it write The Archive when onboarding
  // a brownfield project (analyze the repo, debrief the operator) upstream of planning.
  await db.insert(licenses).values({
    orgId: org.id,
    projectId: web.id,
    agentAlias: '010',
    hashedKey: hashKey('lic_010_demo'),
    sectors: ['BACKEND'],
    scopes: ['recon'],
    status: 'active',
    lastSeenAt: new Date('2026-06-25T08:00:00Z'),
  })

  // ── Operation (= Sprint) ──
  const [op] = await db
    .insert(operations)
    .values({
      projectId: web.id,
      key: 'OP-12',
      codename: 'Operation Nightfall',
      objective: 'Ship the new pricing flow end-to-end',
      status: 'active',
      startsAt: new Date('2026-06-15'),
      endsAt: new Date('2026-06-29'),
      capacityPoints: 40,
      sectorsInScope: ['FRONTEND', 'BACKEND', 'QA'],
      briefingSummary: 'Pricing page + checkout API + tests. Editorial cyberpunk aesthetic.',
      successCriteria: ['Checkout works end-to-end', 'All tests green', 'A11y AA'],
      createdByUserId: hq.id,
    })
    .returning()

  // ── Dossiers (for design missions) ──
  const [d2] = await db
    .insert(dossiers)
    .values({
      projectId: web.id,
      title: 'Pricing API plan',
      status: 'cold_read_passed',
      version: 1,
      sections: {
        problem: 'Tiered pricing endpoint',
        technicalPlan: 'GET /api/pricing returns 3 tiers',
        affectedFiles: ['server/api/pricing.ts'],
      },
      affectedFiles: ['server/api/pricing.ts'],
    })
    .returning()

  // ── Missions (the hand-off chain) ──
  const base = { projectId: web.id, operationId: op.id, estimatePoints: 3 }
  const rows = await db
    .insert(missions)
    .values([
      {
        ...base,
        key: 'WEB-40',
        title: 'Design pricing page layout',
        objective: 'Create the dossier for the pricing page',
        briefing: 'Editorial layout, three tiers, accent CTA. Produce a full design dossier.',
        type: 'design',
        sector: 'DESIGN',
        status: 'done',
        priority: 'high',
        orderIndex: 0,
        acceptanceCriteria: ['Dossier passes Cold Read'],
        claimedByLicenseId: lic006.id,
        result: 'success',
        completedAt: new Date('2026-06-22T12:00:00Z'),
      },
      {
        ...base,
        key: 'WEB-42',
        title: 'Implement pricing API endpoint',
        objective: 'Build /api/pricing',
        briefing: 'Implement the pricing endpoint per dossier WEB-40. Hand off testing to QA.',
        type: 'feature',
        sector: 'BACKEND',
        status: 'in_progress',
        priority: 'high',
        orderIndex: 0,
        acceptanceCriteria: ['Returns tiered pricing', 'Validated input'],
        dossierId: d2.id,
        claimedByLicenseId: lic007.id,
      },
      {
        ...base,
        key: 'WEB-43',
        title: 'Test pricing endpoint',
        objective: 'Verify /api/pricing',
        briefing: 'Test WEB-42. If it fails, hand off a bugfix referencing the original.',
        type: 'test',
        sector: 'QA',
        status: 'in_progress',
        priority: 'high',
        orderIndex: 1,
        acceptanceCriteria: ['All cases pass'],
        claimedByLicenseId: lic009.id,
      },
      {
        ...base,
        key: 'WEB-44',
        title: 'Pricing page component',
        objective: 'Build the Vue page',
        briefing: 'Build the pricing page UI from dossier WEB-40 once API is ready.',
        type: 'feature',
        sector: 'FRONTEND',
        status: 'ready',
        priority: 'medium',
        orderIndex: 0,
        acceptanceCriteria: ['Matches dossier', 'Responsive'],
      },
      {
        ...base,
        key: 'WEB-45',
        title: 'Checkout flow research',
        objective: 'Spike payment options',
        briefing: 'Research checkout/payment integration options.',
        type: 'research',
        sector: 'BACKEND',
        status: 'backlog',
        priority: 'low',
        orderIndex: 0,
        acceptanceCriteria: ['Recommendation documented'],
      },
      {
        ...base,
        key: 'WEB-46',
        title: 'Design checkout dossier',
        objective: 'Draft checkout design',
        briefing: 'Author the checkout design dossier; will go through Cold Read.',
        type: 'design',
        sector: 'DESIGN',
        status: 'cold_read',
        priority: 'medium',
        orderIndex: 0,
        acceptanceCriteria: ['Cold Read pass'],
        claimedByLicenseId: lic006.id,
      },
      {
        ...base,
        key: 'WEB-47',
        title: 'Harden pricing input validation',
        objective: 'Edge cases',
        briefing: 'Add validation hardening discovered during review.',
        type: 'bugfix',
        sector: 'BACKEND',
        status: 'in_review',
        priority: 'high',
        orderIndex: 0,
        acceptanceCriteria: ['Rejects malformed input'],
        claimedByLicenseId: lic007.id,
      },
    ])
    .returning()

  const byKey = Object.fromEntries(rows.map((m) => [m.key, m]))
  await db.update(missions).set({ dossierId: d2.id }).where(eq(missions.id, byKey['WEB-42'].id))
  await db.update(dossiers).set({ missionId: byKey['WEB-42'].id }).where(eq(dossiers.id, d2.id))

  // Draft dossier for WEB-46 (design mission in cold_read) — ready for a Recruit's Cold Read.
  const [d4] = await db
    .insert(dossiers)
    .values({
      projectId: web.id,
      missionId: byKey['WEB-46'].id,
      title: 'Checkout flow design',
      status: 'draft',
      version: 1,
      sections: {
        problem: 'Design the checkout flow',
        technicalPlan: 'Stripe-hosted checkout, 2 steps',
        affectedFiles: ['app/pages/checkout.vue'],
      },
      affectedFiles: ['app/pages/checkout.vue'],
    })
    .returning()
  await db.update(missions).set({ dossierId: d4.id }).where(eq(missions.id, byKey['WEB-46'].id))

  // ── Artifacts ──
  await db.insert(artifacts).values([
    { missionId: byKey['WEB-42'].id, kind: 'pr', url: '#', label: 'PR #128' },
    { missionId: byKey['WEB-47'].id, kind: 'pr', url: '#', label: 'PR #131' },
    // Harness report so WEB-47 (in_review) can pass the done-gate when approved.
    { missionId: byKey['WEB-47'].id, kind: 'test_report', url: '#', label: 'jest: 18 passed' },
  ])

  // ── References (typed cross-links) ── bidirectional, like hand_off / link_missions.
  const links: [string, string, (typeof references.$inferInsert)['linkType']][] = [
    ['WEB-43', 'WEB-42', 'tests'],
    ['WEB-43', 'WEB-42', 'spawned_from'],
    ['WEB-44', 'WEB-42', 'blocked_by'],
    ['WEB-47', 'WEB-42', 'fixes'],
  ]
  for (const [s, t, lt] of links) {
    await createBidirectional({
      projectId: web.id,
      sourceId: byKey[s].id,
      targetId: byKey[t].id,
      linkType: lt,
    })
  }

  // ── Activity log seed (genesis entries) ──
  // Use logActivity so The Wire's hash chain is valid from the start (tamper-evidence).
  await logActivity({
    projectId: web.id,
    missionId: byKey['WEB-40'].id,
    actorType: 'agent',
    actorLicenseId: lic006.id,
    event: 'completed',
    toStatus: 'done',
    message: 'Design dossier accepted via Cold Read',
  })
  await logActivity({
    projectId: web.id,
    missionId: byKey['WEB-42'].id,
    actorType: 'agent',
    actorLicenseId: lic007.id,
    event: 'claimed',
    toStatus: 'in_progress',
    message: 'Claimed pricing API mission',
  })

  console.log(
    `✓ Seeded org=${org.slug} projects=[WEB,APP] missions=${rows.length} licenses=5 (incl. 008 planner, 010 scout) users=4`,
  )
  console.log(`  logins (password "${DEV_PASSWORD}"):`)
  console.log(`    ${HQ_EMAIL}  → super_admin (all)`)
  console.log(`    ${MANAGER_EMAIL}      → manager (all org projects)`)
  console.log(`    ${CONTRIB_EMAIL}    → contributor (WEB only)`)
  console.log(`    ${VIEWER_EMAIL}    → viewer (WEB read-only)`)
  process.exit(0)
}

seed().catch((e) => {
  console.error('Seed failed:', e)
  process.exit(1)
})
