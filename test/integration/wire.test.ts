// Integration tests — require a real Postgres. Opt-in: set TEST_DATABASE_URL
// (e.g. the dev DB) to run them; otherwise they self-skip so `npm test` stays
// infrastructure-free. Run against a seeded database:
//   TEST_DATABASE_URL=postgres://citadel:citadel@localhost:5433/citadel npm test
import { describe, expect, it } from 'vitest'

const RUN = !!process.env.TEST_DATABASE_URL
if (RUN) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!RUN)('integration: The Wire + data (requires TEST_DATABASE_URL)', () => {
  it('the seeded WEB project hash-chain is intact', async () => {
    const { eq } = await import('drizzle-orm')
    const { db, schema } = await import('../../server/db')
    const { verifyProjectChain } = await import('../../server/utils/activity')

    const [web] = await db.select().from(schema.projects).where(eq(schema.projects.key, 'WEB'))
    expect(web, 'seed the DB first (npm run db:seed)').toBeTruthy()

    const res = await verifyProjectChain(web!.id)
    expect(res.intact).toBe(true)
    expect(res.entries).toBeGreaterThan(0)
  })

  it('100 concurrent appends keep the chain intact (advisory-lock serialization, §HORIZON M3)', async () => {
    const { eq } = await import('drizzle-orm')
    const { db, schema } = await import('../../server/db')
    const { logActivity, verifyProjectChain } = await import('../../server/utils/activity')

    const [web] = await db.select().from(schema.projects).where(eq(schema.projects.key, 'WEB'))
    expect(web, 'seed the DB first (npm run db:seed)').toBeTruthy()

    // Fire 100 appends at once — without per-project serialization they would read the same
    // prevHash and fork the chain.
    await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        logActivity({
          projectId: web!.id,
          actorType: 'system',
          event: 'wire_concurrency_probe',
          message: `probe ${i}`,
        }),
      ),
    )

    const res = await verifyProjectChain(web!.id)
    expect(res.intact, 'chain forked under concurrent appends').toBe(true)

    // No two entries share a prevHash (a forked chain would reuse one).
    const rows = await db
      .select({ prevHash: schema.activityLog.prevHash })
      .from(schema.activityLog)
      .where(eq(schema.activityLog.projectId, web!.id))
    const prevHashes = rows.map((r) => r.prevHash).filter((h): h is string => !!h)
    expect(new Set(prevHashes).size, 'duplicate prevHash → chain forked').toBe(prevHashes.length)
  })

  it('every seeded reference has a matching inverse edge (bidirectional integrity)', async () => {
    const { eq } = await import('drizzle-orm')
    const { db, schema } = await import('../../server/db')
    const { INVERSE_LINK } = await import('../../server/utils/references')

    const [web] = await db.select().from(schema.projects).where(eq(schema.projects.key, 'WEB'))
    const refs = await db
      .select()
      .from(schema.references)
      .where(eq(schema.references.projectId, web!.id))

    for (const r of refs) {
      const hasInverse = refs.some(
        (o) =>
          o.sourceKind === r.targetKind &&
          o.sourceId === r.targetId &&
          o.targetKind === r.sourceKind &&
          o.targetId === r.sourceId &&
          o.linkType === INVERSE_LINK[r.linkType],
      )
      expect(hasInverse, `missing inverse for ${r.linkType}`).toBe(true)
    }
  })
})
