// POST /api/auth/login — email + password → session cookie. Throttled per ip+email
// against online password guessing (§22).
import { z } from 'zod'
import { parseBody } from '~~/server/utils/validation'
import { lookupUserByEmail } from '~~/server/utils/auth'
import { verifyPassword } from '~~/server/utils/password'
import {
  assertLoginAllowed,
  recordLoginFailure,
  clearLoginThrottle,
} from '~~/server/utils/ratelimit'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const { email, password } = await parseBody(event, schema)
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  const key = `${ip}:${email.toLowerCase()}`

  assertLoginAllowed(key) // 429 once too many recent failures

  const user = await lookupUserByEmail(email)
  if (!user || !verifyPassword(user.passwordHash, password)) {
    recordLoginFailure(key)
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }
  clearLoginThrottle(key)

  await setUserSession(event, {
    user: { id: user.id, email: user.email, name: user.name, systemRole: user.systemRole },
  })
  return { id: user.id, email: user.email, name: user.name, systemRole: user.systemRole }
})
