// POST /api/v1/projects/:id/design-guidelines — M authors a Design Guideline for a theme
// (manager). Created `active`. One guideline per (project, theme). §Q/§4.
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { getUuidParam, parseBody, designGuidelineSchema } from '~~/server/utils/validation'
import { assertQBranchManager } from '~~/server/utils/qbranch'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const projectId = getUuidParam(event)
  const manager = await assertQBranchManager(event, projectId)
  const body = await parseBody(event, designGuidelineSchema)

  const [existing] = await db
    .select({ id: schema.designGuidelines.id })
    .from(schema.designGuidelines)
    .where(
      and(
        eq(schema.designGuidelines.projectId, projectId),
        eq(schema.designGuidelines.themeKey, body.themeKey),
      ),
    )
  if (existing)
    throw createError({
      statusCode: 409,
      statusMessage: `A guideline for theme "${body.themeKey}" already exists — edit it instead`,
    })

  const [g] = await db
    .insert(schema.designGuidelines)
    .values({
      projectId,
      themeKey: body.themeKey,
      title: body.title,
      bodyMarkdown: body.bodyMarkdown,
      status: 'active',
    })
    .returning()
  if (!g) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

  await logActivity({
    projectId,
    actorType: 'human',
    actorUserId: manager.id,
    event: 'design_guideline_created',
    message: `Created design guideline "${g.title}" for theme ${g.themeKey}`,
    metadata: { guidelineId: g.id, themeKey: g.themeKey },
  })

  setResponseStatus(event, 201)
  return {
    id: g.id,
    themeKey: g.themeKey,
    title: g.title,
    bodyMarkdown: g.bodyMarkdown,
    status: g.status,
  }
})
