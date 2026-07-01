// PATCH /api/v1/quality-gates/:id — M edits a gate and/or flips its status active↔inactive
// (manager). Activating a `pending` (Planner-proposed) gate makes it enforce; deactivating an
// `active` gate retires it without deleting. §Q.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { getUuidParam, parseBody, updateQualityGateSchema } from '~~/server/utils/validation'
import { assertQBranchManager, statusEvent } from '~~/server/utils/qbranch'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const id = getUuidParam(event)
  const [gate] = await db.select().from(schema.qualityGates).where(eq(schema.qualityGates.id, id))
  if (!gate) throw createError({ statusCode: 404, statusMessage: 'Gate not found' })
  const manager = await assertQBranchManager(event, gate.projectId)
  const body = await parseBody(event, updateQualityGateSchema)

  const [updated] = await db
    .update(schema.qualityGates)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.appliesToStatus !== undefined && { appliesToStatus: body.appliesToStatus }),
      ...(body.rule !== undefined && { rule: body.rule }),
      ...(body.blocking !== undefined && { blocking: body.blocking }),
      ...(body.status !== undefined && { status: body.status }),
      updatedAt: new Date(),
    })
    .where(eq(schema.qualityGates.id, id))
    .returning()
  if (!updated) throw createError({ statusCode: 500, statusMessage: 'Update failed' })

  const verb =
    body.status === 'active' ? 'Activated' : body.status === 'inactive' ? 'Deactivated' : 'Updated'
  await logActivity({
    projectId: gate.projectId,
    actorType: 'human',
    actorUserId: manager.id,
    event: statusEvent('quality_gate', body.status),
    message: `${verb} gate "${updated.name}" (${updated.key})`,
    metadata: { gateId: id, key: updated.key },
  })

  return {
    id,
    key: updated.key,
    name: updated.name,
    appliesToStatus: updated.appliesToStatus,
    rule: updated.rule,
    blocking: updated.blocking,
    status: updated.status,
  }
})
