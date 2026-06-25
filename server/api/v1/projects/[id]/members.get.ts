// GET /api/v1/projects/:id/members — users with explicit access to the project.
import { eq, inArray } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertProjectAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')!
  await assertProjectAccess(event, projectId)

  const grants = await db.select().from(schema.projectMemberships).where(eq(schema.projectMemberships.projectId, projectId))
  const userRows = grants.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, grants.map(g => g.userId)))
    : []
  const userById = new Map(userRows.map(u => [u.id, u]))

  return grants.map(g => ({
    userId: g.userId,
    email: userById.get(g.userId)?.email ?? '—',
    name: userById.get(g.userId)?.name ?? '—',
    grantedAt: g.grantedAt,
  }))
})
