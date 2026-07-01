// POST /api/v1/missions/:id/answer-human-input — HQ answers a waiting_human mission (§PARLEY P4).
// The answer is appended to the dossier (so it reaches the resuming mission's context via the
// Briefing/get_mission — resume over shared state, not a thread replay), and the mission is
// re-queued to `ready` so a fresh agent can pick it up with the answer in hand.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertProjectWrite } from '~~/server/utils/auth'
import { getUuidParam, parseBody, answerHumanInputSchema } from '~~/server/utils/validation'
import { assertTransition } from '~~/server/utils/state-machine'
import { appendDossierAddendum } from '~~/server/utils/dossier'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const id = getUuidParam(event)
  const [m] = await db.select().from(schema.missions).where(eq(schema.missions.id, id))
  if (!m) throw createError({ statusCode: 404, statusMessage: 'Mission not found' })
  const { user } = await assertProjectWrite(event, m.projectId)
  const body = await parseBody(event, answerHumanInputSchema)

  if (m.status !== 'waiting_human')
    throw createError({
      statusCode: 409,
      statusMessage: `Mission is ${m.status}, not waiting on a human`,
    })
  assertTransition(m.status, 'ready')

  await appendDossierAddendum(id, {
    kind: 'human_answer',
    by: user.name || user.email,
    body: body.answer,
  })

  // Re-queue so a fresh agent resumes with the answer already in the dossier/context.
  await db
    .update(schema.missions)
    .set({ status: 'ready', claimedByLicenseId: null, claimedAt: null })
    .where(eq(schema.missions.id, id))

  await logActivity({
    projectId: m.projectId,
    missionId: id,
    actorType: 'human',
    actorUserId: user.id,
    event: 'human_input_answered',
    fromStatus: 'waiting_human',
    toStatus: 'ready',
    message: `${m.key}: HQ answered — mission re-queued`,
    metadata: { sector: m.sector },
  })

  return { ok: true, status: 'ready' }
})
