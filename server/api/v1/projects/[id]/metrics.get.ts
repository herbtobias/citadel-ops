// GET /api/v1/projects/:id/metrics — Situation Room work-metrics (§23): status mix,
// review/blocked/cold-read queues, throughput, rework/bounce, lead time, spend.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertProjectAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')!
  await assertProjectAccess(event, projectId)

  const missions = await db.select().from(schema.missions).where(eq(schema.missions.projectId, projectId))
  const byStatus: Record<string, number> = {}
  let leadSum = 0
  let leadCount = 0
  for (const m of missions) {
    byStatus[m.status] = (byStatus[m.status] ?? 0) + 1
    if (m.status === 'done' && m.completedAt) {
      leadSum += (new Date(m.completedAt).getTime() - new Date(m.createdAt).getTime())
      leadCount++
    }
  }

  // Rework / bounce: missions kicked back from review or failed Cold Read.
  const wire = await db.select({ fromStatus: schema.activityLog.fromStatus, toStatus: schema.activityLog.toStatus })
    .from(schema.activityLog).where(eq(schema.activityLog.projectId, projectId))
  const rework = wire.filter(w =>
    (w.fromStatus === 'in_review' && w.toStatus === 'in_progress')
    || (w.fromStatus === 'cold_read' && w.toStatus === 'designing')).length

  // Cost/token spend across deployments.
  const deps = await db.select({ tokensSpent: schema.deployments.tokensSpent, costSpent: schema.deployments.costSpent })
    .from(schema.deployments)
    .innerJoin(schema.missions, eq(schema.deployments.missionId, schema.missions.id))
    .where(eq(schema.missions.projectId, projectId))
  const spend = deps.reduce((a, d) => ({ tokens: a.tokens + (d.tokensSpent ?? 0), cost: a.cost + (d.costSpent ?? 0) }), { tokens: 0, cost: 0 })

  // Agent roster health.
  const licenses = await db.select().from(schema.licenses).where(eq(schema.licenses.projectId, projectId))
  const activeLicenses = licenses.filter(l => l.status === 'active')

  return {
    counts: { byStatus, total: missions.length },
    reviewQueue: byStatus.in_review ?? 0,
    blocked: byStatus.blocked ?? 0,
    coldReadPending: byStatus.cold_read ?? 0,
    done: byStatus.done ?? 0,
    reworkCount: rework,
    avgLeadTimeHours: leadCount ? Math.round((leadSum / leadCount) / 3600_000 * 10) / 10 : null,
    spend,
    agents: { total: licenses.length, active: activeLicenses.length, revoked: licenses.length - activeLicenses.length },
  }
})
