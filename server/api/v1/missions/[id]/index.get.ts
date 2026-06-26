// GET /api/v1/missions/:id — single mission (access-gated via its project).
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertProjectAccess } from '~~/server/utils/auth'
import { serializeMissionById } from '~~/server/utils/dto'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const [m] = await db
    .select({ projectId: schema.missions.projectId })
    .from(schema.missions)
    .where(eq(schema.missions.id, id))
  if (!m) throw createError({ statusCode: 404, statusMessage: 'Mission not found' })
  await assertProjectAccess(event, m.projectId)
  return serializeMissionById(id)
})
