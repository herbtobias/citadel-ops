// POST /api/v1/notifications/read — mark notifications read. Body { ids?: [] } marks
// those; omit ids to mark all of the user's as read.
import { z } from 'zod'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { parseBody } from '~~/server/utils/validation'
import { requireUser } from '~~/server/utils/auth'

const schema_ = z.object({ ids: z.array(z.string().uuid()).optional() })

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { ids } = await parseBody(event, schema_)

  const base = and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt))
  const where = ids?.length ? and(base, inArray(schema.notifications.id, ids)) : base

  await db.update(schema.notifications).set({ readAt: new Date() }).where(where)
  return { ok: true }
})
