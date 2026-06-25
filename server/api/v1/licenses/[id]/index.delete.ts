// DELETE /api/v1/licenses/:id — revoke a license (Kill-Switch, manager). Immediate:
// the agent's next call gets 401 license_revoked. Re-queues its active missions.
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertOrgManager } from '~~/server/utils/auth'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const [lic] = await db.select().from(schema.licenses).where(eq(schema.licenses.id, id))
  if (!lic) throw createError({ statusCode: 404, statusMessage: 'License not found' })
  const manager = await assertOrgManager(event, lic.orgId)

  await db.update(schema.licenses)
    .set({ status: 'revoked', revokedAt: new Date(), revokedBy: manager.id })
    .where(eq(schema.licenses.id, id))

  // Re-queue any in-progress missions this agent held.
  const held = await db.select().from(schema.missions)
    .where(and(eq(schema.missions.claimedByLicenseId, id), eq(schema.missions.status, 'in_progress')))
  for (const m of held) {
    await db.update(schema.missions).set({
      status: 'ready', claimedByLicenseId: null, claimedAt: null, leaseExpiresAt: null, heartbeatAt: null,
    }).where(eq(schema.missions.id, m.id))
    await logActivity({
      projectId: m.projectId, missionId: m.id, actorType: 'system',
      event: 'stand_down', fromStatus: 'in_progress', toStatus: 'ready',
      message: `License revoked; re-queued ${m.key}`,
    })
  }

  await logActivity({
    projectId: lic.projectId, actorType: 'human', actorUserId: manager.id,
    event: 'license_revoked', message: `Revoked license for ${lic.agentAlias}`,
    metadata: { licenseId: id, requeued: held.length },
  })

  return { ok: true, requeued: held.length }
})
