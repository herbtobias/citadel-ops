// POST /api/v1/invitations/accept — redeem an invite token. Creates the user if
// new (name+password required), attaches org membership + project grants, logs in.
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { parseBody } from '~~/server/utils/validation'
import { hashPassword, verifyPassword } from '~~/server/utils/password'

const schema_ = z.object({
  token: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  password: z.string().min(8).max(200).optional(),
})

export default defineEventHandler(async (event) => {
  const { token, name, password } = await parseBody(event, schema_)

  const [inv] = await db
    .select()
    .from(schema.invitations)
    .where(eq(schema.invitations.token, token))
  if (!inv || inv.status !== 'pending')
    throw createError({ statusCode: 404, statusMessage: 'Invitation not found or already used' })
  if (inv.expiresAt && inv.expiresAt < new Date()) {
    await db
      .update(schema.invitations)
      .set({ status: 'expired' })
      .where(eq(schema.invitations.id, inv.id))
    throw createError({ statusCode: 410, statusMessage: 'Invitation expired' })
  }

  const session = await getUserSession(event)
  let userId: string
  let sessionUser: { id: string; email: string; name: string; systemRole: 'super_admin' | 'user' }

  if (session?.user) {
    const su = session.user as typeof sessionUser
    if (su.email !== inv.email)
      throw createError({
        statusCode: 403,
        statusMessage: 'Signed in as a different user than the invite',
      })
    userId = su.id
    sessionUser = su
  } else {
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, inv.email))
    if (existing) {
      if (!password || !verifyPassword(existing.passwordHash, password)) {
        throw createError({
          statusCode: 401,
          statusMessage: 'Password required to accept on an existing account',
        })
      }
      userId = existing.id
      sessionUser = {
        id: existing.id,
        email: existing.email,
        name: existing.name,
        systemRole: existing.systemRole,
      }
    } else {
      if (!name || !password)
        throw createError({
          statusCode: 400,
          statusMessage: 'name and password required for a new account',
        })
      const [created] = await db
        .insert(schema.users)
        .values({
          email: inv.email,
          name,
          passwordHash: hashPassword(password),
          systemRole: 'user',
        })
        .returning()
      if (!created) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })
      userId = created.id
      sessionUser = {
        id: created.id,
        email: created.email,
        name: created.name,
        systemRole: created.systemRole,
      }
    }
  }

  // Attach org membership (idempotent).
  const [existingMembership] = await db
    .select()
    .from(schema.orgMemberships)
    .where(
      and(eq(schema.orgMemberships.orgId, inv.orgId), eq(schema.orgMemberships.userId, userId)),
    )
  if (!existingMembership) {
    await db
      .insert(schema.orgMemberships)
      .values({ orgId: inv.orgId, userId, role: inv.orgRole, status: 'active' })
  } else {
    await db
      .update(schema.orgMemberships)
      .set({ role: inv.orgRole, status: 'active' })
      .where(eq(schema.orgMemberships.id, existingMembership.id))
  }

  // Project grants from the invite (skip dups).
  for (const projectId of inv.projectIds) {
    const [g] = await db
      .select()
      .from(schema.projectMemberships)
      .where(
        and(
          eq(schema.projectMemberships.projectId, projectId),
          eq(schema.projectMemberships.userId, userId),
        ),
      )
    if (!g)
      await db
        .insert(schema.projectMemberships)
        .values({ projectId, userId, grantedByUserId: inv.invitedByUserId })
  }

  await db
    .update(schema.invitations)
    .set({ status: 'accepted' })
    .where(eq(schema.invitations.id, inv.id))
  await setUserSession(event, { user: sessionUser })

  return { ok: true, orgId: inv.orgId, role: inv.orgRole }
})
