// GET /api/v1/notifications?unread=1&limit= — the signed-in user's notifications.
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { requireUser } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const q = getQuery(event)
  const unreadOnly = q.unread === '1' || q.unread === 'true'
  const limit = Math.min(Number.parseInt((q.limit as string) || '50', 10) || 50, 200)

  const where = unreadOnly
    ? and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt))
    : eq(schema.notifications.userId, user.id)

  const rows = await db.select().from(schema.notifications)
    .where(where).orderBy(desc(schema.notifications.createdAt)).limit(limit)

  const unread = await db.$count(schema.notifications, and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)))

  return {
    unread,
    notifications: rows.map(n => ({ id: n.id, type: n.type, payload: n.payload, projectId: n.projectId, readAt: n.readAt, createdAt: n.createdAt })),
  }
})
