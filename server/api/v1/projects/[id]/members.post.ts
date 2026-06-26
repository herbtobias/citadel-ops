// POST /api/v1/projects/:id/members — grant a user access to the project (manager).
// The target must already be a member of the project's organization.
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { parseBody } from '~~/server/utils/validation'
import { assertOrgManager } from '~~/server/utils/auth'

const schema_ = z.object({ email: z.string().email() })

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')!
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const manager = await assertOrgManager(event, project.orgId)
  const { email } = await parseBody(event, schema_)

  const [target] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase()))
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const [member] = await db
    .select()
    .from(schema.orgMemberships)
    .where(
      and(
        eq(schema.orgMemberships.orgId, project.orgId),
        eq(schema.orgMemberships.userId, target.id),
      ),
    )
  if (!member)
    throw createError({
      statusCode: 422,
      statusMessage: 'User is not a member of this organization',
    })

  const [existing] = await db
    .select()
    .from(schema.projectMemberships)
    .where(
      and(
        eq(schema.projectMemberships.projectId, projectId),
        eq(schema.projectMemberships.userId, target.id),
      ),
    )
  if (!existing) {
    await db
      .insert(schema.projectMemberships)
      .values({ projectId, userId: target.id, grantedByUserId: manager.id })
  }

  setResponseStatus(event, 201)
  return { ok: true, userId: target.id }
})
