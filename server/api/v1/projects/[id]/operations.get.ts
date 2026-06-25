// GET /api/v1/projects/:id/operations — operations (sprints) for a project.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertProjectAccess } from '~~/server/utils/auth'
import { serializeOperation } from '~~/server/utils/dto'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await assertProjectAccess(event, id)
  const rows = await db.select().from(schema.operations).where(eq(schema.operations.projectId, id))
  return rows.map(serializeOperation)
})
