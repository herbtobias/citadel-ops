// POST /api/v1/organizations — create an organization (SuperAdmin only, §15).
// The named owner becomes a manager member.
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { parseBody } from '~~/server/utils/validation'
import { isSuperAdmin, requireUser } from '~~/server/utils/auth'

const schema_ = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'lowercase letters, digits and dashes only'),
  ownerEmail: z.string().email(),
})

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (!isSuperAdmin(user)) throw createError({ statusCode: 403, statusMessage: 'SuperAdmin only' })

  const { name, slug, ownerEmail } = await parseBody(event, schema_)

  const [owner] = await db.select().from(schema.users).where(eq(schema.users.email, ownerEmail.toLowerCase()))
  if (!owner) throw createError({ statusCode: 404, statusMessage: 'Owner user not found (must register first)' })

  const [dup] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, slug))
  if (dup) throw createError({ statusCode: 409, statusMessage: 'Slug already taken' })

  const [org] = await db.insert(schema.organizations).values({ name, slug, ownerUserId: owner.id }).returning()
  await db.insert(schema.orgMemberships).values({ orgId: org.id, userId: owner.id, role: 'manager' })

  setResponseStatus(event, 201)
  return { id: org.id, name: org.name, slug: org.slug }
})
