// POST /api/v1/agent/claim-next — atomically claim the next ready mission in the
// license's sector(s) (DSPTCH, §9). Uses FOR UPDATE SKIP LOCKED so two agents never
// grab the same mission. Sets a lease; honours maxMissionsPerAgent; idempotent.
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import {
  requireLicense,
  sweepExpiredLeases,
  withIdempotency,
  LEASE_MS,
} from '~~/server/utils/license'
import { logActivity } from '~~/server/utils/activity'
import { serializeMissionById } from '~~/server/utils/dto'

export default defineEventHandler(async (event) => {
  const lic = await requireLicense(event)
  if (!lic.projectId)
    throw createError({ statusCode: 422, statusMessage: 'License is not bound to a project' })
  const projectId = lic.projectId
  const idemKey = getHeader(event, 'idempotency-key') || undefined

  // Re-queue any leases that expired before we look for work (watchdog, §21).
  await sweepExpiredLeases(projectId)

  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
  const maxPerAgent = project?.settings?.maxMissionsPerAgent ?? 3

  // Loop-guard: don't exceed this agent's WIP.
  const active = await db
    .select({ id: schema.missions.id })
    .from(schema.missions)
    .where(
      and(
        eq(schema.missions.claimedByLicenseId, lic.id),
        eq(schema.missions.status, 'in_progress'),
      ),
    )
  if (active.length >= maxPerAgent) {
    throw createError({
      statusCode: 429,
      statusMessage: `WIP limit reached (${maxPerAgent} missions in progress)`,
    })
  }

  const sectors = lic.sectors as string[]
  if (sectors.length === 0) return { claimed: null, reason: 'no sectors on license' }

  const priorityRank = sql`CASE ${schema.missions.priority}
    WHEN 'urgent' THEN 3 WHEN 'high' THEN 2 WHEN 'medium' THEN 1 ELSE 0 END`

  const run = async () => {
    const claimedId = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(schema.missions)
        .where(
          and(
            eq(schema.missions.projectId, projectId),
            eq(schema.missions.status, 'ready'),
            inArray(schema.missions.sector, sectors as any),
          ),
        )
        .orderBy(sql`${priorityRank} DESC`, schema.missions.orderIndex, schema.missions.createdAt)
        .limit(1)
        .for('update', { skipLocked: true })

      if (rows.length === 0) return null
      const m = rows[0]!
      const now = new Date()
      await tx
        .update(schema.missions)
        .set({
          status: 'in_progress',
          claimedByLicenseId: lic.id,
          claimedAt: now,
          leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
          heartbeatAt: now,
          updatedAt: now,
        })
        .where(eq(schema.missions.id, m.id))
      return m.id
    })

    if (!claimedId) return { result: { claimed: null as any }, resultRef: undefined }

    // Track the run (Deployment) + log the claim.
    await db
      .insert(schema.deployments)
      .values({ missionId: claimedId, licenseId: lic.id, runnerStatus: 'running' })
    await logActivity({
      projectId,
      missionId: claimedId,
      actorType: 'agent',
      actorLicenseId: lic.id,
      event: 'claimed',
      toStatus: 'in_progress',
      message: `${lic.agentAlias} claimed mission`,
    })
    const mission = await serializeMissionById(claimedId)
    return { result: { claimed: mission }, resultRef: claimedId }
  }

  return withIdempotency(idemKey, 'claim', run)
})
