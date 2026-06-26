// DELETE /api/v1/webhooks/:id — remove a webhook subscription (manager).
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertOrgManager } from '~~/server/utils/auth'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const id = getUuidParam(event)
  const [sub] = await db
    .select()
    .from(schema.webhookSubscriptions)
    .where(eq(schema.webhookSubscriptions.id, id))
  if (!sub) throw createError({ statusCode: 404, statusMessage: 'Webhook not found' })
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, sub.projectId))
  await assertOrgManager(event, project!.orgId)

  await db.delete(schema.webhookSubscriptions).where(eq(schema.webhookSubscriptions.id, id))
  return { ok: true }
})
