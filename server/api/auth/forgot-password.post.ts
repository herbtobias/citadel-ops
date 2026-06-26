// POST /api/auth/forgot-password — request a reset link (§22). Always returns 200
// (no account enumeration). When the email maps to a user, mint a single-use token,
// store only its hash, and email the reset link. Lightly throttled per IP.
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { parseBody } from '~~/server/utils/validation'
import { sendPasswordResetEmail } from '~~/server/utils/mailer'
import { enforceRateLimit } from '~~/server/utils/ratelimit'

const schema_ = z.object({ email: z.string().email() })

export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  enforceRateLimit(`forgot:${ip}`, 5) // 5/min per IP

  const { email } = await parseBody(event, schema_)
  const lower = email.toLowerCase()
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, lower))

  if (user) {
    // Invalidate any prior unused tokens for this user, then mint a fresh one.
    await db
      .update(schema.passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(schema.passwordResetTokens.userId, user.id),
          isNull(schema.passwordResetTokens.usedAt),
        ),
      )

    const token = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    await db.insert(schema.passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    })

    const base = useRuntimeConfig().public.appUrl || getRequestURL(event).origin
    await sendPasswordResetEmail({ to: lower, resetUrl: `${base}/reset-password?token=${token}` })
  }

  // Same response whether or not the email exists.
  return { ok: true }
})
