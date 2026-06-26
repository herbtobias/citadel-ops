// GET /api/v1/missions/:id/activity — Wire entries for one mission (dossier timeline).
import { desc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertProjectAccess } from '~~/server/utils/auth'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const missionId = getUuidParam(event)
  const [m] = await db
    .select({ projectId: schema.missions.projectId })
    .from(schema.missions)
    .where(eq(schema.missions.id, missionId))
  if (!m) throw createError({ statusCode: 404, statusMessage: 'Mission not found' })
  await assertProjectAccess(event, m.projectId)

  const rows = await db
    .select()
    .from(schema.activityLog)
    .where(eq(schema.activityLog.missionId, missionId))
    .orderBy(desc(schema.activityLog.createdAt))

  const licenseIds = [...new Set(rows.map((r) => r.actorLicenseId).filter(Boolean) as string[])]
  const userIds = [...new Set(rows.map((r) => r.actorUserId).filter(Boolean) as string[])]
  const licenses = licenseIds.length
    ? await db
        .select({ id: schema.licenses.id, alias: schema.licenses.agentAlias })
        .from(schema.licenses)
        .where(inArray(schema.licenses.id, licenseIds))
    : []
  const users = userIds.length
    ? await db
        .select({ id: schema.users.id, name: schema.users.name })
        .from(schema.users)
        .where(inArray(schema.users.id, userIds))
    : []
  const lAlias = new Map(licenses.map((l) => [l.id, l.alias]))
  const uName = new Map(users.map((u) => [u.id, u.name]))

  return rows.map((r) => ({
    id: r.id,
    event: r.event,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    message: r.message,
    actor:
      r.actorType === 'agent'
        ? `agent ${r.actorLicenseId ? (lAlias.get(r.actorLicenseId) ?? '?') : ''}`.trim()
        : r.actorType === 'human'
          ? r.actorUserId
            ? (uName.get(r.actorUserId) ?? 'HQ')
            : 'HQ'
          : 'system',
    createdAt: r.createdAt,
  }))
})
