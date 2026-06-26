// POST /api/v1/organizations/:id/invitations — invite a member by email (manager).
// Sends the accept link by email (SMTP when configured, otherwise logged); the token
// is also returned so it can be shared manually if mail isn't wired yet.
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { parseBody } from '~~/server/utils/validation'
import { assertOrgManager } from '~~/server/utils/auth'
import { sendInvitationEmail } from '~~/server/utils/mailer'

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
    const [m] = await db
      .select()
      .from(schema.orgMemberships)
      .where(
        and(
          eq(schema.orgMemberships.orgId, orgId),
          eq(schema.orgMemberships.userId, existingUser.id),
        ),
      )
    if (m) throw createError({ statusCode: 409, statusMessage: 'Already a member' })
  }

  // Supersede any prior pending invite for this email+org.
  await db
    .update(schema.invitations)
    .set({ status: 'revoked' })
    .where(
      and(
        eq(schema.invitations.orgId, orgId),
        eq(schema.invitations.email, lower),
        eq(schema.invitations.status, 'pending'),
      ),
    )

  const token = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  const [inv] = await db
    .insert(schema.invitations)
    .values({
      orgId,
      email: lower,
      orgRole: role,
      projectIds,
      token,
      invitedByUserId: user.id,
      expiresAt,
    })
    .returning()
  if (!inv) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

  // Build an absolute accept link (configured base URL, else this request's origin).
  const base = useRuntimeConfig().public.appUrl || getRequestURL(event).origin
  const acceptUrl = `${base}/accept-invite?token=${inv.token}`

  const [org] = await db
    .select({ name: schema.organizations.name })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
  const mail = await sendInvitationEmail({
    to: lower,
    orgName: org?.name ?? 'your team',
    role,
    acceptUrl,
  })

  setResponseStatus(event, 201)
  return {
    id: inv.id,
    email: inv.email,
    role: inv.orgRole,
    token: inv.token,
    acceptUrl,
    emailSent: mail.sent,
  }
})
