// POST /api/v1/projects/:id/quality-gates — M authors a Quality Gate (manager). Created
// `active` at once (no approval step — M IS the approver). §Q.
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { getUuidParam, parseBody, qualityGateSchema } from '~~/server/utils/validation'
import { assertQBranchManager } from '~~/server/utils/qbranch'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const projectId = getUuidParam(event)
  const manager = await assertQBranchManager(event, projectId)
  const body = await parseBody(event, qualityGateSchema)

  const [existing] = await db
    .select({ id: schema.qualityGates.id })
    .from(schema.qualityGates)
    .where(and(eq(schema.qualityGates.projectId, projectId), eq(schema.qualityGates.key, body.key)))
  if (existing)
    throw createError({
      statusCode: 409,
      statusMessage: `A gate with key "${body.key}" already exists`,
    })

  const [gate] = await db
    .insert(schema.qualityGates)
    .values({
      projectId,
      key: body.key,
      name: body.name,
      appliesToStatus: body.appliesToStatus,
      rule: body.rule,
      blocking: body.blocking,
      status: 'active',
    })
    .returning()
  if (!gate) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

  await logActivity({
    projectId,
    actorType: 'human',
    actorUserId: manager.id,
    event: 'quality_gate_created',
    message: `Created gate "${gate.name}" (${gate.key}) @ ${gate.appliesToStatus}`,
    metadata: { gateId: gate.id, key: gate.key },
  })

  setResponseStatus(event, 201)
  return {
    id: gate.id,
    key: gate.key,
    name: gate.name,
    appliesToStatus: gate.appliesToStatus,
    rule: gate.rule,
    blocking: gate.blocking,
    status: gate.status,
  }
})
