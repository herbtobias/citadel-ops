// DELETE /api/v1/licenses/:id — revoke a license (Kill-Switch, manager). Immediate:
// the agent's next call gets 401 license_revoked. Re-queues its active missions.
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertOrgManager } from '~~/server/utils/auth'
import { logActivity } from '~~/server/utils/activity'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const id = getUuidParam(event)
  const [lic] = await db.select().from(schema.licenses).where(eq(schema.licenses.id, id))
  if (!lic) throw createError({ statusCode: 404, statusMessage: 'License not found' })
  const manager = await assertOrgManager(event, lic.orgId)

  // Revoke this license and — if it's a provisioning key — all the session licenses it
  // minted (cascade kill-switch, §C). Missions held by any of them get re-queued.
  const children = await db
    .select()
    .from(schema.licenses)
    .where(eq(schema.licenses.parentLicenseId, id))
  const targetIds = [id, ...children.map((c) => c.id)]

  await db
    .update(schema.licenses)
    .set({ status: 'revoked', revokedAt: new Date(), revokedBy: manager.id })
    .where(inArray(schema.licenses.id, targetIds))

  // Re-queue any in-progress missions these agents held.
  const held = await db
    .select()
    .from(schema.missions)
    .where(
      and(
        inArray(schema.missions.claimedByLicenseId, targetIds),
        eq(schema.missions.status, 'in_progress'),
      ),
    )
  for (const m of held) {
    await db
      .update(schema.missions)
      .set({
        status: 'ready',
        claimedByLicenseId: null,
        claimedAt: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      })
      .where(eq(schema.missions.id, m.id))
    await logActivity({
      projectId: m.projectId,
      missionId: m.id,
      actorType: 'system',
      event: 'stand_down',
      fromStatus: 'in_progress',
      toStatus: 'ready',
      message: `License revoked; re-queued ${m.key}`,
    })
  }

  const childNote = children.length ? ` (+${children.length} session license(s))` : ''
  await logActivity({
    projectId: lic.projectId,
    actorType: 'human',
    actorUserId: manager.id,
    event: 'license_revoked',
    message: `Revoked license for ${lic.agentAlias}${childNote}`,
    metadata: { licenseId: id, requeued: held.length, sessionsRevoked: children.length },
  })

  return { ok: true, requeued: held.length, sessionsRevoked: children.length }
})
