// POST /api/v1/dossiers/:id/cold-read — record a Cold Read verdict (the Cold Read gate, §7).
// A zero-context Recruit (a different license than the author) proves understanding.
// pass → mission cold_read→ready; fail → cold_read→designing (revise).
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { parseBody } from '~~/server/utils/validation'
import { resolveProjectActor } from '~~/server/utils/actor'
import { assertTransition } from '~~/server/utils/state-machine'
import { logActivity } from '~~/server/utils/activity'

const schema_ = z.object({
  verdict: z.enum(['pass', 'fail']),
  comprehensionNotes: z.string().max(4000).optional(),
  openQuestions: z.array(z.string()).optional().default([]),
})

export default defineEventHandler(async (event) => {
  const dossierId = getRouterParam(event, 'id')!
  const [dossier] = await db.select().from(schema.dossiers).where(eq(schema.dossiers.id, dossierId))
  if (!dossier) throw createError({ statusCode: 404, statusMessage: 'Dossier not found' })

  const actor = await resolveProjectActor(event, dossier.projectId)
  const body = await parseBody(event, schema_)

  const [mission] = dossier.missionId
    ? await db.select().from(schema.missions).where(eq(schema.missions.id, dossier.missionId))
    : []

  // Zero-context rule: the Recruit must not be the agent working the mission.
  if (actor.kind === 'agent' && mission && mission.claimedByLicenseId === actor.license.id) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Cold Read must be performed by a different agent (zero-context Recruit)',
    })
  }

  await db.insert(schema.coldReadChecks).values({
    dossierId,
    recruitLicenseId: actor.license?.id ?? null,
    verdict: body.verdict,
    comprehensionNotes: body.comprehensionNotes ?? null,
    openQuestions: body.openQuestions,
  })

  const passed = body.verdict === 'pass'
  await db
    .update(schema.dossiers)
    .set({
      status: passed ? 'cold_read_passed' : 'cold_read_failed',
      coldRead: {
        verdict: body.verdict,
        recruitLicenseId: actor.license?.id,
        comprehensionNotes: body.comprehensionNotes,
        openQuestions: body.openQuestions,
      },
      updatedAt: new Date(),
    })
    .where(eq(schema.dossiers.id, dossierId))

  let missionStatus: string | undefined
  if (mission && mission.status === 'cold_read') {
    const to = passed ? 'ready' : 'designing'
    assertTransition(mission.status, to)
    await db
      .update(schema.missions)
      .set({ status: to, updatedAt: new Date() })
      .where(eq(schema.missions.id, mission.id))
    missionStatus = to
    await logActivity({
      projectId: dossier.projectId,
      missionId: mission.id,
      actorType: actor.kind === 'agent' ? 'agent' : 'human',
      actorLicenseId: actor.license?.id,
      actorUserId: actor.user?.id,
      event: 'cold_read_run',
      fromStatus: 'cold_read',
      toStatus: to,
      message: `Cold Read ${body.verdict} — ${passed ? 'promoted to ready' : 'returned for revision'}`,
    })
  }

  return {
    verdict: body.verdict,
    dossierStatus: passed ? 'cold_read_passed' : 'cold_read_failed',
    missionStatus,
  }
})
