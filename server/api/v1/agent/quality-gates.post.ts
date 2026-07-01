// POST /api/v1/agent/quality-gates — Planner: propose a Quality Gate from the requirements.
// Requires the `plan` scope. The gate lands `pending` and does NOT enforce until a manager
// activates it in HQ (M's Desk / Q-Branch). §Q/§10.
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { qualityGateSchema, parseBody } from '~~/server/utils/validation'
import { requireLicense, assertPlanScope } from '~~/server/utils/license'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const lic = await requireLicense(event)
  assertPlanScope(lic)
  if (!lic.projectId)
    throw createError({ statusCode: 422, statusMessage: 'License is not bound to a project' })
  const projectId = lic.projectId
  const body = await parseBody(event, qualityGateSchema)

  // Keys are unique per project — a Planner cannot shadow an existing gate.
  const [existing] = await db
    .select({ id: schema.qualityGates.id })
    .from(schema.qualityGates)
    .where(and(eq(schema.qualityGates.projectId, projectId), eq(schema.qualityGates.key, body.key)))
  if (existing)
    throw createError({
      statusCode: 409,
      statusMessage: `A gate with key "${body.key}" already exists on this project`,
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
      status: 'pending',
      createdByLicenseId: lic.id,
    })
    .returning()
  if (!gate) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

  await logActivity({
    projectId,
    actorType: 'agent',
    actorLicenseId: lic.id,
    event: 'quality_gate_proposed',
    message: `Proposed gate "${gate.name}" (${gate.key}) @ ${gate.appliesToStatus} — pending M approval`,
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
