// POST /api/v1/agent/missions/:id/request-human-input — the agent asks HQ a question and
// durably suspends the mission (§PARLEY P3). Unlike `block` (an obstacle) this parks the
// mission in `waiting_human`, stops the lease clock (so the watchdog never re-queues it),
// and records the question as a dossier addendum so the answer + question survive into the
// resuming mission's context. HQ answers via POST /api/v1/missions/:id/answer-human-input.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { requireLicense } from '~~/server/utils/license'
import { getUuidParam, parseBody, requestHumanInputSchema } from '~~/server/utils/validation'
import { assertTransition } from '~~/server/utils/state-machine'
import { appendDossierAddendum } from '~~/server/utils/dossier'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const id = getUuidParam(event)
  const lic = await requireLicense(event)
  const body = await parseBody(event, requestHumanInputSchema)

  const [m] = await db.select().from(schema.missions).where(eq(schema.missions.id, id))
  if (!m) throw createError({ statusCode: 404, statusMessage: 'Mission not found' })
  if (m.claimedByLicenseId !== lic.id)
    throw createError({ statusCode: 403, statusMessage: 'Mission not claimed by this license' })
  assertTransition(m.status, 'waiting_human')

  // Park the mission and STOP the lease clock — durable suspension (§PARLEY P2).
  await db
    .update(schema.missions)
    .set({ status: 'waiting_human', leaseExpiresAt: null, heartbeatAt: null })
    .where(eq(schema.missions.id, id))

  await appendDossierAddendum(id, {
    kind: 'human_question',
    by: lic.agentAlias,
    body: body.question,
    meta: { context: body.context ?? null, options: body.options },
  })

  await logActivity({
    projectId: m.projectId,
    missionId: id,
    actorType: 'agent',
    actorLicenseId: lic.id,
    event: 'human_input_requested',
    fromStatus: m.status,
    toStatus: 'waiting_human',
    message: `${m.key}: agent asked HQ — ${body.question.slice(0, 120)}`,
    metadata: { urgency: body.options.urgency, format: body.options.format },
  })

  return { ok: true, status: 'waiting_human' }
})
