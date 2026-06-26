// GET /api/v1/organizations/:id/members — roster + pending invites (manager only).
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertOrgManager } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, 'id')!
  await assertOrgManager(event, orgId)

  const memberships = await db
    .select()
    .from(schema.orgMemberships)
    .where(eq(schema.orgMemberships.orgId, orgId))
  const userRows = memberships.length
    ? await db
        .select()
        .from(schema.users)
        .where(
          inArray(
            schema.users.id,
            memberships.map((m) => m.userId),
          ),
        )
    : []
  const userById = new Map(userRows.map((u) => [u.id, u]))

  const members = memberships.map((m) => ({
    userId: m.userId,
    email: userById.get(m.userId)?.email ?? '—',
    name: userById.get(m.userId)?.name ?? '—',
    role: m.role,
    status: m.status,
    joinedAt: m.joinedAt,
  }))

  const invites = await db
    .select()
    .from(schema.invitations)
    .where(and(eq(schema.invitations.orgId, orgId), eq(schema.invitations.status, 'pending')))

  return {
    members,
    invitations: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.orgRole,
      token: i.token,
      expiresAt: i.expiresAt,
    })),
  }
})
