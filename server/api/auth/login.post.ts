// POST /api/auth/login — email + password → session cookie.
import { z } from 'zod'
import { parseBody } from '~~/server/utils/validation'
import { lookupUserByEmail } from '~~/server/utils/auth'
import { verifyPassword } from '~~/server/utils/password'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const { email, password } = await parseBody(event, schema)
  const user = await lookupUserByEmail(email)
  if (!user || !verifyPassword(user.passwordHash, password)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }
  await setUserSession(event, {
    user: { id: user.id, email: user.email, name: user.name, systemRole: user.systemRole },
  })
  return { id: user.id, email: user.email, name: user.name, systemRole: user.systemRole }
})
