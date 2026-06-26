// GET /api/v1/projects/:id/quality-gates — Q-Branch gates (user or agent).
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { resolveProjectActor } from '~~/server/utils/actor'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const projectId = getUuidParam(event)
  await resolveProjectActor(event, projectId)
  const rows = await db
    .select()
    .from(schema.qualityGates)
    .where(eq(schema.qualityGates.projectId, projectId))
  return rows.map((g) => ({
    key: g.key,
    name: g.name,
    appliesToStatus: g.appliesToStatus,
    rule: g.rule,
    blocking: g.blocking,
  }))
})
