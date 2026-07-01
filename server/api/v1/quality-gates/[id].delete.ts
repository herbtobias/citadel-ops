// DELETE /api/v1/quality-gates/:id — M removes a gate (manager). Used to dismiss a
// Planner-proposed (`pending`) gate or retire one for good. §Q.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { getUuidParam } from '~~/server/utils/validation'
import { assertQBranchManager } from '~~/server/utils/qbranch'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const id = getUuidParam(event)
  const [gate] = await db.select().from(schema.qualityGates).where(eq(schema.qualityGates.id, id))
  if (!gate) throw createError({ statusCode: 404, statusMessage: 'Gate not found' })
  const manager = await assertQBranchManager(event, gate.projectId)

  await db.delete(schema.qualityGates).where(eq(schema.qualityGates.id, id))
  await logActivity({
    projectId: gate.projectId,
    actorType: 'human',
    actorUserId: manager.id,
    event: 'quality_gate_deleted',
    message: `Deleted gate "${gate.name}" (${gate.key})`,
    metadata: { gateId: id, key: gate.key, wasStatus: gate.status },
  })
  return { id, deleted: true }
})
