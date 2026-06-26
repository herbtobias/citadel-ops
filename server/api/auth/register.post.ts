// POST /api/auth/register — self-service signup. Creates a platform user with no
// org yet (they join orgs by accepting an invitation). Logs them in.
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { parseBody } from '~~/server/utils/validation'
import { hashPassword } from '~~/server/utils/password'

const schema_ = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
})

export default defineEventHandler(async (event) => {
  const { email, name, password } = await parseBody(event, schema_)
  const lower = email.toLowerCase()

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, lower))
  if (existing) throw createError({ statusCode: 409, statusMessage: 'Email already registered' })

  const [user] = await db
    .insert(schema.users)
    .values({
      email: lower,
      name,
      passwordHash: hashPassword(password),
      systemRole: 'user',
    })
    .returning()
  if (!user) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

  await setUserSession(event, {
    user: { id: user.id, email: user.email, name: user.name, systemRole: user.systemRole },
  })
  setResponseStatus(event, 201)
  return { id: user.id, email: user.email, name: user.name, systemRole: user.systemRole }
})
