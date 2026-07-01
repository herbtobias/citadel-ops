// GET /api/v1/projects/:id/quality-gates — Q-Branch gates. Agents see only ACTIVE gates
// (the ones in force); HQ users see all (incl. pending/inactive) to manage them. §Q.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { resolveProjectActor } from '~~/server/utils/actor'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const projectId = getUuidParam(event)
  const actor = await resolveProjectActor(event, projectId)
  const rows = await db
    .select()
    .from(schema.qualityGates)
    .where(eq(schema.qualityGates.projectId, projectId))
  const visible = actor.kind === 'agent' ? rows.filter((g) => g.status === 'active') : rows
  return visible.map((g) => ({
    id: g.id,
    key: g.key,
    name: g.name,
    appliesToStatus: g.appliesToStatus,
    rule: g.rule,
    blocking: g.blocking,
    status: g.status,
    proposed: !!g.createdByLicenseId,
  }))
})
