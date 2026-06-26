// POST /api/v1/operations/:id/close — close an Operation (→ completed). Manager only.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertOrgManager } from '~~/server/utils/auth'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const [op] = await db.select().from(schema.operations).where(eq(schema.operations.id, id))
  if (!op) throw createError({ statusCode: 404, statusMessage: 'Operation not found' })
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, op.projectId))
  const manager = await assertOrgManager(event, project!.orgId)

  await db
    .update(schema.operations)
    .set({ status: 'completed', endsAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.operations.id, id))
  await logActivity({
    projectId: op.projectId,
    operationId: id,
    actorType: 'human',
    actorUserId: manager.id,
    event: 'operation_closed',
    message: `Closed ${op.key}: ${op.codename}`,
  })
  return { ok: true, status: 'completed' }
})
