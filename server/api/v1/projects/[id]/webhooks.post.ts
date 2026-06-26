// POST /api/v1/projects/:id/webhooks — register an outbound webhook (Leiter, manager).
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { parseBody } from '~~/server/utils/validation'
import { assertOrgManager } from '~~/server/utils/auth'

const schema_ = z.object({
  url: z.string().url(),
  events: z.array(z.string()).optional().default(['*']),
  secret: z.string().min(8).max(200).optional(),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')!
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  await assertOrgManager(event, project.orgId)

  const body = await parseBody(event, schema_)
  const [sub] = await db
    .insert(schema.webhookSubscriptions)
    .values({
      projectId,
      url: body.url,
      events: body.events,
      secret: body.secret ?? null,
    })
    .returning()
  if (!sub) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

  setResponseStatus(event, 201)
  return { id: sub.id, url: sub.url, events: sub.events, active: sub.active }
})
