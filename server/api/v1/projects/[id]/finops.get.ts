// GET /api/v1/projects/:id/finops — cost attribution (§26): token/cost spend by agent
// and by operation, plus the configured quota. Access-gated.
import { eq, inArray } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertProjectAccess } from '~~/server/utils/auth'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const projectId = getUuidParam(event)
  const { project } = await assertProjectAccess(event, projectId)

  const deps = await db
    .select({
      tokensSpent: schema.deployments.tokensSpent,
      costSpent: schema.deployments.costSpent,
      licenseId: schema.deployments.licenseId,
      operationId: schema.missions.operationId,
    })
    .from(schema.deployments)
    .innerJoin(schema.missions, eq(schema.deployments.missionId, schema.missions.id))
    .where(eq(schema.missions.projectId, projectId))

  const licIds = [...new Set(deps.map((d) => d.licenseId).filter(Boolean) as string[])]
  const opIds = [...new Set(deps.map((d) => d.operationId).filter(Boolean) as string[])]
  const lics = licIds.length
    ? await db
        .select({ id: schema.licenses.id, alias: schema.licenses.agentAlias })
        .from(schema.licenses)
        .where(inArray(schema.licenses.id, licIds))
    : []
  const ops = opIds.length
    ? await db
        .select({ id: schema.operations.id, key: schema.operations.key })
        .from(schema.operations)
        .where(inArray(schema.operations.id, opIds))
    : []
  const alias = new Map(lics.map((l) => [l.id, l.alias]))
  const opKey = new Map(ops.map((o) => [o.id, o.key]))

  const byAgent: Record<string, { tokens: number; cost: number }> = {}
  const byOperation: Record<string, { tokens: number; cost: number }> = {}
  let tokens = 0
  let cost = 0
  for (const d of deps) {
    tokens += d.tokensSpent ?? 0
    cost += d.costSpent ?? 0
    const a = d.licenseId ? (alias.get(d.licenseId) ?? 'unknown') : 'unknown'
    const o = d.operationId ? (opKey.get(d.operationId) ?? 'none') : 'none'
    byAgent[a] = {
      tokens: (byAgent[a]?.tokens ?? 0) + (d.tokensSpent ?? 0),
      cost: (byAgent[a]?.cost ?? 0) + (d.costSpent ?? 0),
    }
    byOperation[o] = {
      tokens: (byOperation[o]?.tokens ?? 0) + (d.tokensSpent ?? 0),
      cost: (byOperation[o]?.cost ?? 0) + (d.costSpent ?? 0),
    }
  }

  const quota = (project.settings as any).monthlyCostQuota ?? null
  return {
    total: { tokens, cost },
    quota,
    overQuota: quota != null && cost > quota,
    byAgent,
    byOperation,
    runs: deps.length,
  }
})
