// DELETE /api/v1/projects/:id/members?userId=… — revoke a user's project access (manager).
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertOrgManager } from '~~/server/utils/auth'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const projectId = getUuidParam(event)
  const userId = getQuery(event).userId as string | undefined
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'userId query param required' })

  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  await assertOrgManager(event, project.orgId)

  await db
    .delete(schema.projectMemberships)
    .where(
      and(
        eq(schema.projectMemberships.projectId, projectId),
        eq(schema.projectMemberships.userId, userId),
      ),
    )
  return { ok: true }
})
