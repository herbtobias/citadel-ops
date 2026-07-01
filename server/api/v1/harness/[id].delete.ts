// DELETE /api/v1/harness/:id — M removes a Harness Definition (manager). §Q.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { getUuidParam } from '~~/server/utils/validation'
import { assertQBranchManager } from '~~/server/utils/qbranch'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const id = getUuidParam(event)
  const [h] = await db.select().from(schema.harnessDefs).where(eq(schema.harnessDefs.id, id))
  if (!h) throw createError({ statusCode: 404, statusMessage: 'Harness not found' })
  const manager = await assertQBranchManager(event, h.projectId)

  await db.delete(schema.harnessDefs).where(eq(schema.harnessDefs.id, id))
  await logActivity({
    projectId: h.projectId,
    actorType: 'human',
    actorUserId: manager.id,
    event: 'harness_deleted',
    message: `Deleted harness "${h.name}" (${h.key})`,
    metadata: { harnessId: id, key: h.key },
  })
  return { id, deleted: true }
})
