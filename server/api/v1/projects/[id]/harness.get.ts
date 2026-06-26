// GET /api/v1/projects/:id/harness — Harness Definitions (build/test/lint). User or agent.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { resolveProjectActor } from '~~/server/utils/actor'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const projectId = getUuidParam(event)
  await resolveProjectActor(event, projectId)
  const rows = await db
    .select()
    .from(schema.harnessDefs)
    .where(eq(schema.harnessDefs.projectId, projectId))
  return rows.map((h) => ({ key: h.key, name: h.name, commands: h.commands, notes: h.notes }))
})
