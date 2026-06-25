// PATCH /api/v1/missions/:id — update editable mission fields (not status;
// status changes go through /transition).
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { updateMissionSchema, parseBody } from '~~/server/utils/validation'
import { assertMissionWrite } from '~~/server/utils/auth'
import { logActivity } from '~~/server/utils/activity'
import { serializeMissionById } from '~~/server/utils/dto'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { user } = await assertMissionWrite(event, id)
  const body = await parseBody(event, updateMissionSchema)

  const [existing] = await db.select().from(schema.missions).where(eq(schema.missions.id, id))
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Mission not found' })

  await db.update(schema.missions)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(schema.missions.id, id))

  await logActivity({
    projectId: existing.projectId, missionId: id, actorType: 'human', actorUserId: user.id,
    event: 'updated', message: `Updated fields: ${Object.keys(body).join(', ') || 'none'}`,
  })

  return serializeMissionById(id)
})
