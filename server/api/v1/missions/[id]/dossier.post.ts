// POST /api/v1/missions/:id/dossier — file a dossier for a mission (The Archive, §7).
// Agent must own the mission claim; users need write access. Moves a `designing`
// mission to `cold_read` (awaiting a Recruit's Cold Read).
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { getUuidParam, parseBody } from '~~/server/utils/validation'
import { resolveProjectActor } from '~~/server/utils/actor'
import { logActivity } from '~~/server/utils/activity'

const sections = z
  .object({
    problem: z.string().optional(),
    background: z.string().optional(),
    technicalPlan: z.string().optional(),
    affectedFiles: z.array(z.string()).optional(),
    rejectedAlternatives: z.string().optional(),
    implementationSteps: z.string().optional(),
    acceptanceCriteria: z.string().optional(),
    risks: z.string().optional(),
    handoffNotes: z.string().optional(),
    references: z.string().optional(),
  })
  .partial()

const schema_ = z.object({
  title: z.string().min(1).max(200),
  sections: sections.optional().default({}),
  affectedFiles: z.array(z.string()).optional().default([]),
})

export default defineEventHandler(async (event) => {
  const missionId = getUuidParam(event)
  const [mission] = await db.select().from(schema.missions).where(eq(schema.missions.id, missionId))
  if (!mission) throw createError({ statusCode: 404, statusMessage: 'Mission not found' })

  const actor = await resolveProjectActor(event, mission.projectId)
  if (actor.kind === 'agent' && mission.claimedByLicenseId !== actor.license.id) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Filing a dossier requires owning the mission claim',
    })
  }
  const body = await parseBody(event, schema_)

  const [dossier] = await db
    .insert(schema.dossiers)
    .values({
      projectId: mission.projectId,
      missionId,
      title: body.title,
      status: 'draft',
      sections: body.sections,
      affectedFiles: body.affectedFiles,
    })
    .returning()
  if (!dossier) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

  const patch: Record<string, unknown> = { dossierId: dossier.id, updatedAt: new Date() }
  // designing → cold_read once a dossier exists.
  if (mission.status === 'designing') patch.status = 'cold_read'
  await db.update(schema.missions).set(patch).where(eq(schema.missions.id, missionId))

  await logActivity({
    projectId: mission.projectId,
    missionId,
    actorType: actor.kind === 'agent' ? 'agent' : 'human',
    actorLicenseId: actor.license?.id,
    actorUserId: actor.user?.id,
    event: 'dossier_filed',
    fromStatus: mission.status,
    toStatus: patch.status as string | undefined,
    message: `Filed dossier "${body.title}"`,
  })

  setResponseStatus(event, 201)
  return { id: dossier.id, status: dossier.status, missionStatus: patch.status ?? mission.status }
})
