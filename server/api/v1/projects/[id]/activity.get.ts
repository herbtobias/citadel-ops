// GET /api/v1/projects/:id/activity?limit= — recent Wire entries (Control & Audit).
import { desc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertProjectAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')!
  await assertProjectAccess(event, projectId)
  const limit = Math.min(
    Number.parseInt((getQuery(event).limit as string) || '100', 10) || 100,
    500,
  )

  const rows = await db
    .select()
    .from(schema.activityLog)
    .where(eq(schema.activityLog.projectId, projectId))
    .orderBy(desc(schema.activityLog.createdAt))
    .limit(limit)

  // Resolve mission keys + actor (alias/user name) for display.
  const missionIds = [...new Set(rows.map((r) => r.missionId).filter(Boolean) as string[])]
  const licenseIds = [...new Set(rows.map((r) => r.actorLicenseId).filter(Boolean) as string[])]
  const userIds = [...new Set(rows.map((r) => r.actorUserId).filter(Boolean) as string[])]
  const missions = missionIds.length
    ? await db
        .select({ id: schema.missions.id, key: schema.missions.key })
        .from(schema.missions)
        .where(inArray(schema.missions.id, missionIds))
    : []
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
  const mKey = new Map(missions.map((m) => [m.id, m.key]))
  const lAlias = new Map(licenses.map((l) => [l.id, l.alias]))
  const uName = new Map(users.map((u) => [u.id, u.name]))

  return rows.map((r) => ({
    id: r.id,
    event: r.event,
    missionKey: r.missionId ? (mKey.get(r.missionId) ?? null) : null,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    message: r.message,
    actor:
      r.actorType === 'agent'
        ? r.actorLicenseId
          ? `agent ${lAlias.get(r.actorLicenseId) ?? '?'}`
          : 'agent'
        : r.actorType === 'human'
          ? r.actorUserId
            ? (uName.get(r.actorUserId) ?? 'HQ')
            : 'HQ'
          : 'system',
    actorType: r.actorType,
    createdAt: r.createdAt,
  }))
})
