// GET /api/v1/projects/:id/webhooks — list webhooks + recent delivery stats (access).
import { desc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertProjectAccess } from '~~/server/utils/auth'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const projectId = getUuidParam(event)
  await assertProjectAccess(event, projectId)

  const subs = await db
    .select()
    .from(schema.webhookSubscriptions)
    .where(eq(schema.webhookSubscriptions.projectId, projectId))
  const deliveries = subs.length
    ? await db
        .select()
        .from(schema.webhookDeliveries)
        .where(
          inArray(
            schema.webhookDeliveries.subscriptionId,
            subs.map((s) => s.id),
          ),
        )
        .orderBy(desc(schema.webhookDeliveries.createdAt))
        .limit(50)
    : []

  return subs.map((s) => ({
    id: s.id,
    url: s.url,
    events: s.events,
    active: s.active,
    recentDeliveries: deliveries
      .filter((d) => d.subscriptionId === s.id)
      .slice(0, 5)
      .map((d) => ({
        event: d.event,
        ok: d.ok,
        statusCode: d.statusCode,
        attempts: d.attempts,
        createdAt: d.createdAt,
      })),
  }))
})
