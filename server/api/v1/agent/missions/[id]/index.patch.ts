// PATCH /api/v1/agent/missions/:id — Planner: groom an existing Mission (not status;
// status goes through the board / transition). Requires the `plan` scope. The param
// accepts a mission id or key (WEB-42); operation re-assignment is by key.
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { agentUpdateMissionSchema, parseBody } from '~~/server/utils/validation'
import { requireLicense, assertPlanScope } from '~~/server/utils/license'
import { logActivity } from '~~/server/utils/activity'
import { serializeMissionById } from '~~/server/utils/dto'

export default defineEventHandler(async (event) => {
  const param = getRouterParam(event, 'id')!
  const lic = await requireLicense(event)
  assertPlanScope(lic)
  if (!lic.projectId)
    throw createError({ statusCode: 422, statusMessage: 'License is not bound to a project' })
  const projectId = lic.projectId
  const body = await parseBody(event, agentUpdateMissionSchema)

  // Resolve by id within the project, else by key.
  const [mission] = await db
    .select()
    .from(schema.missions)
    .where(
      and(
        eq(schema.missions.projectId, projectId),
        param.includes('-') ? eq(schema.missions.key, param) : eq(schema.missions.id, param),
      ),
    )
  if (!mission) throw createError({ statusCode: 404, statusMessage: `Mission ${param} not found` })

  // Translate operationKey → operationId (null clears the assignment).
  const { operationKey, ...fields } = body
  const patch: Record<string, unknown> = { ...fields }
  if (operationKey !== undefined) {
    if (operationKey === null) {
      patch.operationId = null
    } else {
      const [op] = await db
        .select()
        .from(schema.operations)
        .where(
          and(eq(schema.operations.projectId, projectId), eq(schema.operations.key, operationKey)),
        )
      if (!op)
        throw createError({ statusCode: 404, statusMessage: `Operation ${operationKey} not found` })
      patch.operationId = op.id
    }
  }

  if (Object.keys(patch).length === 0)
    throw createError({ statusCode: 422, statusMessage: 'No fields to update' })

  await db
    .update(schema.missions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.missions.id, mission.id))

  await logActivity({
    projectId,
    missionId: mission.id,
    actorType: 'agent',
    actorLicenseId: lic.id,
    event: 'updated',
    message: `Groomed ${mission.key}: ${Object.keys(patch).join(', ')}`,
  })

  return serializeMissionById(mission.id)
})
