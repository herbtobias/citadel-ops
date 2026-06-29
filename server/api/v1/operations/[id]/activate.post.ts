// POST /api/v1/operations/:id/activate — activate a planned Operation (→ active). Manager only.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertOrgManager } from '~~/server/utils/auth'
import { logActivity } from '~~/server/utils/activity'
import { getUuidParam } from '~~/server/utils/validation'
import { serializeOperation } from '~~/server/utils/dto'

export default defineEventHandler(async (event) => {
  const id = getUuidParam(event)
  const [op] = await db.select().from(schema.operations).where(eq(schema.operations.id, id))
  if (!op) throw createError({ statusCode: 404, statusMessage: 'Operation not found' })
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, op.projectId))
  const manager = await assertOrgManager(event, project!.orgId)

  if (op.status !== 'planned') {
    throw createError({
      statusCode: 409,
      statusMessage: `Only a planned Operation can be activated (this one is ${op.status})`,
    })
  }

  const [updated] = await db
    .update(schema.operations)
    .set({ status: 'active', startsAt: op.startsAt ?? new Date(), updatedAt: new Date() })
    .where(eq(schema.operations.id, id))
    .returning()
  await logActivity({
    projectId: op.projectId,
    operationId: id,
    actorType: 'human',
    actorUserId: manager.id,
    event: 'operation_activated',
    fromStatus: 'planned',
    toStatus: 'active',
    message: `Activated ${op.key}: ${op.codename}`,
  })
  return serializeOperation(updated!)
})
