// GET /api/v1/organizations — orgs the user belongs to (super_admin sees all).
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { isSuperAdmin, requireUser } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  if (isSuperAdmin(user)) {
    const orgs = await db.select().from(schema.organizations)
    return orgs.map(o => ({ id: o.id, name: o.name, slug: o.slug, role: 'manager' as const }))
  }

  const memberships = await db.select().from(schema.orgMemberships)
    .where(and(eq(schema.orgMemberships.userId, user.id), eq(schema.orgMemberships.status, 'active')))
  if (memberships.length === 0) return []

  const orgs = await db.select().from(schema.organizations)
    .where(inArray(schema.organizations.id, memberships.map(m => m.orgId)))
  const roleByOrg = new Map(memberships.map(m => [m.orgId, m.role]))
  return orgs.map(o => ({ id: o.id, name: o.name, slug: o.slug, role: roleByOrg.get(o.id) }))
})
