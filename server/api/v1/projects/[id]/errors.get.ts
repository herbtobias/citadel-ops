// GET /api/v1/projects/:id/errors — recent ErrorEvents for a project (Echelon feed).
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertProjectAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')!
  await assertProjectAccess(event, projectId)
  const limit = Math.min(Number.parseInt((getQuery(event).limit as string) || '50', 10) || 50, 200)

  const rows = await db.select().from(schema.errorEvents)
    .where(eq(schema.errorEvents.projectId, projectId))
    .orderBy(desc(schema.errorEvents.createdAt))
    .limit(limit)

  return rows.map(r => ({
    id: r.id, traceId: r.traceId, source: r.source, level: r.level,
    message: r.message, missionId: r.missionId, context: r.context, createdAt: r.createdAt,
  }))
})
