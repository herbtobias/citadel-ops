// GET /api/v1/projects/:id/traces?limit= — agent/HQ requests grouped by traceId
// (Echelon, §25). Each trace = the activity + errors produced by one request, so you
// can see exactly what a given call did. Access-gated.
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertProjectAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')!
  await assertProjectAccess(event, projectId)
  const limit = Math.min(Number.parseInt((getQuery(event).limit as string) || '25', 10) || 25, 100)

  // Pull a window of recent traced activity, then group.
  const rows = await db.select().from(schema.activityLog)
    .where(and(eq(schema.activityLog.projectId, projectId), isNotNull(schema.activityLog.traceId)))
    .orderBy(desc(schema.activityLog.createdAt))
    .limit(400)

  // Resolve display labels (mission keys, actor names) in bulk.
  const missionIds = [...new Set(rows.map(r => r.missionId).filter(Boolean) as string[])]
  const licIds = [...new Set(rows.map(r => r.actorLicenseId).filter(Boolean) as string[])]
  const userIds = [...new Set(rows.map(r => r.actorUserId).filter(Boolean) as string[])]
  const missions = missionIds.length ? await db.select({ id: schema.missions.id, key: schema.missions.key }).from(schema.missions).where(inArray(schema.missions.id, missionIds)) : []
  const lics = licIds.length ? await db.select({ id: schema.licenses.id, alias: schema.licenses.agentAlias }).from(schema.licenses).where(inArray(schema.licenses.id, licIds)) : []
  const users = userIds.length ? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, userIds)) : []
  const mKey = new Map(missions.map(m => [m.id, m.key]))
  const lAlias = new Map(lics.map(l => [l.id, l.alias]))
  const uName = new Map(users.map(u => [u.id, u.name]))
  const actorOf = (r: typeof rows[number]) => r.actorType === 'agent'
    ? `agent ${r.actorLicenseId ? lAlias.get(r.actorLicenseId) ?? '?' : ''}`.trim()
    : r.actorType === 'human' ? (r.actorUserId ? uName.get(r.actorUserId) ?? 'HQ' : 'HQ') : 'system'

  // Group into traces (most-recent first), capped at `limit`.
  const order: string[] = []
  const byTrace = new Map<string, typeof rows>()
  for (const r of rows) {
    const t = r.traceId!
    if (!byTrace.has(t)) { byTrace.set(t, []); order.push(t) }
    byTrace.get(t)!.push(r)
  }
  const traceIds = order.slice(0, limit)

  // Errors for these traces.
  const errs = traceIds.length
    ? await db.select().from(schema.errorEvents).where(inArray(schema.errorEvents.traceId, traceIds))
    : []

  return traceIds.map((t) => {
    const entries = byTrace.get(t)!.slice().reverse() // chronological within the trace
    return {
      traceId: t,
      startedAt: entries[0].createdAt,
      actor: actorOf(entries[0]),
      actorType: entries[0].actorType,
      eventCount: entries.length,
      errorCount: errs.filter(e => e.traceId === t).length,
      events: entries.map(e => ({
        event: e.event, missionKey: e.missionId ? mKey.get(e.missionId) ?? null : null,
        fromStatus: e.fromStatus, toStatus: e.toStatus, message: e.message, createdAt: e.createdAt,
      })),
      errors: errs.filter(e => e.traceId === t).map(e => ({ source: e.source, message: e.message })),
    }
  })
})
