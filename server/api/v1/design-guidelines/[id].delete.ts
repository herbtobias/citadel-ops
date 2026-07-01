// DELETE /api/v1/design-guidelines/:id — M removes a Design Guideline (manager). §Q/§4.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { getUuidParam } from '~~/server/utils/validation'
import { assertQBranchManager } from '~~/server/utils/qbranch'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const id = getUuidParam(event)
  const [g] = await db
    .select()
    .from(schema.designGuidelines)
    .where(eq(schema.designGuidelines.id, id))
  if (!g) throw createError({ statusCode: 404, statusMessage: 'Guideline not found' })
  const manager = await assertQBranchManager(event, g.projectId)

  await db.delete(schema.designGuidelines).where(eq(schema.designGuidelines.id, id))
  await logActivity({
    projectId: g.projectId,
    actorType: 'human',
    actorUserId: manager.id,
    event: 'design_guideline_deleted',
    message: `Deleted design guideline "${g.title}" (${g.themeKey})`,
    metadata: { guidelineId: id, themeKey: g.themeKey },
  })
  return { id, deleted: true }
})
