// GET /api/v1/projects/:id/deployments — agent-run (Deployment) history for a project.
// Each claim opens a Deployment; complete closes it. Surfaces runner status + spend.
import { desc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertProjectAccess } from '~~/server/utils/auth'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const projectId = getUuidParam(event)
  await assertProjectAccess(event, projectId)
  const limit = Math.min(Number.parseInt((getQuery(event).limit as string) || '50', 10) || 50, 200)

  const rows = await db
    .select({
      id: schema.deployments.id,
      missionId: schema.deployments.missionId,
      missionKey: schema.missions.key,
      licenseId: schema.deployments.licenseId,
      runnerStatus: schema.deployments.runnerStatus,
      tokensSpent: schema.deployments.tokensSpent,
      costSpent: schema.deployments.costSpent,
      startedAt: schema.deployments.startedAt,
      finishedAt: schema.deployments.finishedAt,
    })
    .from(schema.deployments)
    .innerJoin(schema.missions, eq(schema.deployments.missionId, schema.missions.id))
    .where(eq(schema.missions.projectId, projectId))
    .orderBy(desc(schema.deployments.startedAt))
    .limit(limit)

  const licIds = [...new Set(rows.map((r) => r.licenseId).filter(Boolean) as string[])]
  const lics = licIds.length
    ? await db
        .select({ id: schema.licenses.id, alias: schema.licenses.agentAlias })
        .from(schema.licenses)
        .where(inArray(schema.licenses.id, licIds))
    : []
  const alias = new Map(lics.map((l) => [l.id, l.alias]))

  return rows.map((r) => ({
    id: r.id,
    missionKey: r.missionKey,
    agentAlias: r.licenseId ? (alias.get(r.licenseId) ?? null) : null,
    runnerStatus: r.runnerStatus,
    tokensSpent: r.tokensSpent,
    costSpent: r.costSpent,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
  }))
})
