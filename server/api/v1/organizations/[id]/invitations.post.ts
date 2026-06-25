// POST /api/v1/organizations/:id/invitations — invite a member by email (manager).
// Email delivery is deferred (P8); the accept token/link is returned so it can be
// shared manually in the meantime.
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { parseBody } from '~~/server/utils/validation'
import { assertOrgManager } from '~~/server/utils/auth'

const schema_ = z.object({
  email: z.string().email(),
  role: z.enum(['manager', 'contributor', 'viewer']).default('contributor'),
  projectIds: z.array(z.string().uuid()).optional().default([]),
})

export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, 'id')!
  const user = await assertOrgManager(event, orgId)
  const { email, role, projectIds } = await parseBody(event, schema_)
  const lower = email.toLowerCase()

  // Reject if already an active member.
  const [existingUser] = await db.select().from(schema.users).where(eq(schema.users.email, lower))
  if (existingUser) {
    const [m] = await db.select().from(schema.orgMemberships)
      .where(and(eq(schema.orgMemberships.orgId, orgId), eq(schema.orgMemberships.userId, existingUser.id)))
    if (m) throw createError({ statusCode: 409, statusMessage: 'Already a member' })
  }

  // Supersede any prior pending invite for this email+org.
  await db.update(schema.invitations).set({ status: 'revoked' })
    .where(and(eq(schema.invitations.orgId, orgId), eq(schema.invitations.email, lower), eq(schema.invitations.status, 'pending')))

  const token = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  const [inv] = await db.insert(schema.invitations).values({
    orgId, email: lower, orgRole: role, projectIds, token, invitedByUserId: user.id, expiresAt,
  }).returning()

  setResponseStatus(event, 201)
  return { id: inv.id, email: inv.email, role: inv.orgRole, token: inv.token, acceptUrl: `/accept-invite?token=${inv.token}` }
})
