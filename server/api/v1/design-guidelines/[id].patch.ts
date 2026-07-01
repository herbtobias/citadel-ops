// PATCH /api/v1/design-guidelines/:id — M edits a Design Guideline and/or flips its status
// active↔inactive (manager). Changing the theme is guarded against colliding with an existing
// guideline for that theme. §Q/§4.
import { and, eq, ne } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { getUuidParam, parseBody, updateDesignGuidelineSchema } from '~~/server/utils/validation'
import { assertQBranchManager, statusEvent } from '~~/server/utils/qbranch'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const id = getUuidParam(event)
  const [g] = await db
    .select()
    .from(schema.designGuidelines)
    .where(eq(schema.designGuidelines.id, id))
  if (!g) throw createError({ statusCode: 404, statusMessage: 'Guideline not found' })
  const manager = await assertQBranchManager(event, g.projectId)
  const body = await parseBody(event, updateDesignGuidelineSchema)

  if (body.themeKey !== undefined && body.themeKey !== g.themeKey) {
    const [clash] = await db
      .select({ id: schema.designGuidelines.id })
      .from(schema.designGuidelines)
      .where(
        and(
          eq(schema.designGuidelines.projectId, g.projectId),
          eq(schema.designGuidelines.themeKey, body.themeKey),
          ne(schema.designGuidelines.id, id),
        ),
      )
    if (clash)
      throw createError({
        statusCode: 409,
        statusMessage: `A guideline for theme "${body.themeKey}" already exists`,
      })
  }

  const [updated] = await db
    .update(schema.designGuidelines)
    .set({
      ...(body.themeKey !== undefined && { themeKey: body.themeKey }),
      ...(body.title !== undefined && { title: body.title }),
      ...(body.bodyMarkdown !== undefined && { bodyMarkdown: body.bodyMarkdown }),
      ...(body.status !== undefined && { status: body.status }),
      updatedAt: new Date(),
    })
    .where(eq(schema.designGuidelines.id, id))
    .returning()
  if (!updated) throw createError({ statusCode: 500, statusMessage: 'Update failed' })

  const verb =
    body.status === 'active' ? 'Activated' : body.status === 'inactive' ? 'Deactivated' : 'Updated'
  await logActivity({
    projectId: g.projectId,
    actorType: 'human',
    actorUserId: manager.id,
    event: statusEvent('design_guideline', body.status),
    message: `${verb} design guideline "${updated.title}" (${updated.themeKey})`,
    metadata: { guidelineId: id, themeKey: updated.themeKey },
  })

  return {
    id,
    themeKey: updated.themeKey,
    title: updated.title,
    bodyMarkdown: updated.bodyMarkdown,
    status: updated.status,
  }
})
