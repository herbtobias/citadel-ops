// POST /api/v1/projects/:id/missions — create a mission. Generates the next
// project-scoped key (e.g. WEB-48), logs to The Wire.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { createMissionSchema, parseBody } from '~~/server/utils/validation'
import { assertProjectWrite } from '~~/server/utils/auth'
import { logActivity } from '~~/server/utils/activity'
import { serializeMissionById } from '~~/server/utils/dto'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')!
  const { user, project } = await assertProjectWrite(event, projectId)
  const body = await parseBody(event, createMissionSchema)

  // Next key: max numeric suffix for this project's prefix + 1.
  const existing = await db
    .select({ key: schema.missions.key })
    .from(schema.missions)
    .where(eq(schema.missions.projectId, projectId))
  const maxNum = existing.reduce((max, m) => {
    const n = Number.parseInt(m.key.split('-')[1] ?? '0', 10)
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
  const key = `${project.key}-${maxNum + 1}`

  const [created] = await db
    .insert(schema.missions)
    .values({
      projectId,
      key,
      title: body.title,
      objective: body.objective,
      briefing: body.briefing,
      type: body.type,
      sector: body.sector,
      priority: body.priority,
      estimatePoints: body.estimatePoints ?? null,
      acceptanceCriteria: body.acceptanceCriteria,
      requiredSkills: body.requiredSkills,
      operationId: body.operationId ?? null,
      parentId: body.parentId ?? null,
      orderIndex: body.orderIndex ?? 0,
      status: 'backlog',
    })
    .returning()
  if (!created) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

  await logActivity({
    projectId,
    missionId: created.id,
    actorType: 'human',
    actorUserId: user.id,
    event: 'created',
    toStatus: 'backlog',
    message: `Created ${key}: ${body.title}`,
  })

  setResponseStatus(event, 201)
  return serializeMissionById(created.id)
})
