// POST /api/v1/agent/missions/:id/comments — add a comment to a mission (log_work).
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { parseBody } from '~~/server/utils/validation'
import { requireLicense } from '~~/server/utils/license'
import { logActivity } from '~~/server/utils/activity'

const schema_ = z.object({ body: z.string().min(1).max(4000) })

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const lic = await requireLicense(event)
  const { body } = await parseBody(event, schema_)
  const [m] = await db.select().from(schema.missions).where(eq(schema.missions.id, id))
  if (!m) throw createError({ statusCode: 404, statusMessage: 'Mission not found' })

  const [c] = await db
    .insert(schema.comments)
    .values({ missionId: id, authorLicenseId: lic.id, body })
    .returning()
  if (!c) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })
  await logActivity({
    projectId: m.projectId,
    missionId: id,
    actorType: 'agent',
    actorLicenseId: lic.id,
    event: 'comment_added',
    message: body.slice(0, 120),
  })
  setResponseStatus(event, 201)
  return { id: c.id }
})
