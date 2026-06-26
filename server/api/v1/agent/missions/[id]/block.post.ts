// POST /api/v1/agent/missions/:id/block — report a blocker (in_progress → blocked).
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { getUuidParam, parseBody } from '~~/server/utils/validation'
import { requireLicense } from '~~/server/utils/license'
import { assertTransition } from '~~/server/utils/state-machine'
import { logActivity } from '~~/server/utils/activity'
import { serializeMissionById } from '~~/server/utils/dto'

const schema_ = z.object({ reason: z.string().min(1).max(2000) })

export default defineEventHandler(async (event) => {
  const id = getUuidParam(event)
  const lic = await requireLicense(event)
  const { reason } = await parseBody(event, schema_)
  const [m] = await db.select().from(schema.missions).where(eq(schema.missions.id, id))
  if (!m) throw createError({ statusCode: 404, statusMessage: 'Mission not found' })
  if (m.claimedByLicenseId !== lic.id)
    throw createError({ statusCode: 403, statusMessage: 'Mission not claimed by this license' })

  assertTransition(m.status, 'blocked')
  await db
    .update(schema.missions)
    .set({ status: 'blocked', updatedAt: new Date() })
    .where(eq(schema.missions.id, id))
  await logActivity({
    projectId: m.projectId,
    missionId: id,
    actorType: 'agent',
    actorLicenseId: lic.id,
    event: 'blocked',
    fromStatus: m.status,
    toStatus: 'blocked',
    message: reason,
  })
  return serializeMissionById(id)
})
