// POST /api/auth/reset-password — redeem a reset token and set a new password (§22).
// Token is matched by hash, must be unused and unexpired; it's single-use. The user
// then logs in normally (no auto-session, so a leaked link can't grant a session).
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { parseBody } from '~~/server/utils/validation'
import { hashPassword } from '~~/server/utils/password'

const schema_ = z.object({
  token: z.string().min(32),
  password: z.string().min(8).max(200),
})

export default defineEventHandler(async (event) => {
  const { token, password } = await parseBody(event, schema_)
  const tokenHash = createHash('sha256').update(token).digest('hex')

  const [row] = await db
    .select()
    .from(schema.passwordResetTokens)
    .where(
      and(
        eq(schema.passwordResetTokens.tokenHash, tokenHash),
        isNull(schema.passwordResetTokens.usedAt),
        gt(schema.passwordResetTokens.expiresAt, new Date()),
      ),
    )
  if (!row) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid or expired reset link' })
  }

  await db
    .update(schema.users)
    .set({ passwordHash: hashPassword(password) })
    .where(eq(schema.users.id, row.userId))
  await db
    .update(schema.passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(schema.passwordResetTokens.id, row.id))

  return { ok: true }
})
