// POST /api/v1/agent/missions/:id/submit — submit a claimed mission for review
// (in_progress → in_review). Reviews are non-blocking (§13). Owner only.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { requireLicense } from '~~/server/utils/license'
import { assertTransition } from '~~/server/utils/state-machine'
import { logActivity } from '~~/server/utils/activity'
import { serializeMissionById } from '~~/server/utils/dto'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const id = getUuidParam(event)
  const lic = await requireLicense(event)
  const [m] = await db.select().from(schema.missions).where(eq(schema.missions.id, id))
  if (!m) throw createError({ statusCode: 404, statusMessage: 'Mission not found' })
  if (m.claimedByLicenseId !== lic.id)
    throw createError({ statusCode: 403, statusMessage: 'Mission not claimed by this license' })

  assertTransition(m.status, 'in_review')
  await db
    .update(schema.missions)
    .set({ status: 'in_review', updatedAt: new Date() })
    .where(eq(schema.missions.id, id))
  await logActivity({
    projectId: m.projectId,
    missionId: id,
    actorType: 'agent',
    actorLicenseId: lic.id,
    event: 'submitted_for_review',
    fromStatus: m.status,
    toStatus: 'in_review',
    message: `${lic.agentAlias} submitted for review`,
  })
  return serializeMissionById(id)
})
