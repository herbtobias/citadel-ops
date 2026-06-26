// POST /api/v1/agent/operations — Planner: plan an Operation (sprint) in the
// License's project. Requires the `plan` scope. Created `planned` (or `active` if
// activate=true). §10/§17.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { planOperationSchema, parseBody } from '~~/server/utils/validation'
import { requireLicense, assertPlanScope } from '~~/server/utils/license'
import { nextOperationKey } from '~~/server/utils/planning'
import { logActivity } from '~~/server/utils/activity'
import { serializeOperation } from '~~/server/utils/dto'

export default defineEventHandler(async (event) => {
  const lic = await requireLicense(event)
  assertPlanScope(lic)
  if (!lic.projectId)
    throw createError({ statusCode: 422, statusMessage: 'License is not bound to a project' })
  const projectId = lic.projectId
  const body = await parseBody(event, planOperationSchema)

  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const key = await nextOperationKey(projectId)
  const [op] = await db
    .insert(schema.operations)
    .values({
      projectId,
      key,
      codename: body.codename,
      objective: body.objective,
      status: body.activate ? 'active' : 'planned',
      sectorsInScope: body.sectorsInScope,
      capacityPoints: body.capacityPoints ?? null,
      successCriteria: body.successCriteria,
    })
    .returning()
  if (!op) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

  await logActivity({
    projectId,
    operationId: op.id,
    actorType: 'agent',
    actorLicenseId: lic.id,
    event: 'operation_planned',
    message: `Planned ${key}: ${body.codename}`,
  })

  setResponseStatus(event, 201)
  return serializeOperation(op)
})
