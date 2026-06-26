// POST /api/v1/agent/missions — Planner: create a Mission in the License's project.
// Requires the `plan` scope. Agents reason in keys, so operation/parent are given by
// key (OP-1 / WEB-42) and resolved here. Files into `backlog` by default (or `ready`
// to skip the design/cold-read gate for simple work). §10/§17.
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { agentCreateMissionSchema, parseBody } from '~~/server/utils/validation'
import { requireLicense, assertPlanScope, withIdempotency } from '~~/server/utils/license'
import { nextMissionKey } from '~~/server/utils/planning'
import { logActivity } from '~~/server/utils/activity'
import { serializeMissionById } from '~~/server/utils/dto'

export default defineEventHandler(async (event) => {
  const lic = await requireLicense(event)
  assertPlanScope(lic)
  if (!lic.projectId)
    throw createError({ statusCode: 422, statusMessage: 'License is not bound to a project' })
  const projectId = lic.projectId
  const body = await parseBody(event, agentCreateMissionSchema)
  const idemKey = getHeader(event, 'idempotency-key') || undefined

  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  // Resolve optional operation/parent by key (within this project).
  let operationId: string | null = null
  if (body.operationKey) {
    const [op] = await db
      .select()
      .from(schema.operations)
      .where(
        and(
          eq(schema.operations.projectId, projectId),
          eq(schema.operations.key, body.operationKey),
        ),
      )
    if (!op)
      throw createError({
        statusCode: 404,
        statusMessage: `Operation ${body.operationKey} not found`,
      })
    operationId = op.id
  }
  let parentId: string | null = null
  if (body.parentKey) {
    const [parent] = await db
      .select()
      .from(schema.missions)
      .where(and(eq(schema.missions.projectId, projectId), eq(schema.missions.key, body.parentKey)))
    if (!parent)
      throw createError({ statusCode: 404, statusMessage: `Mission ${body.parentKey} not found` })
    parentId = parent.id
  }

  const run = async () => {
    const key = await nextMissionKey(projectId, project.key)
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
        operationId,
        parentId,
        status: body.status,
        createdByLicenseId: lic.id,
      })
      .returning()
    if (!created) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

    await logActivity({
      projectId,
      missionId: created.id,
      actorType: 'agent',
      actorLicenseId: lic.id,
      event: 'created',
      toStatus: body.status,
      message: `Planned ${key}: ${body.title} (${body.sector}/${body.type})`,
    })

    return { result: await serializeMissionById(created.id), resultRef: created.id }
  }

  setResponseStatus(event, 201)
  return withIdempotency(idemKey, 'agent-create-mission', run)
})
