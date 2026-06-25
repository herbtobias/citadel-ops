// POST /api/v1/licenses/verify — check a raw license key (body { key }).
// Returns validity + scope without requiring a session (agents self-check).
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { parseBody } from '~~/server/utils/validation'
import { hashLicenseKey } from '~~/server/utils/license'

const schema_ = z.object({ key: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const { key } = await parseBody(event, schema_)
  const [lic] = await db.select().from(schema.licenses).where(eq(schema.licenses.hashedKey, hashLicenseKey(key)))

  if (!lic) return { valid: false, reason: 'unknown' }
  if (lic.status !== 'active') return { valid: false, reason: lic.status }
  if (lic.expiresAt && lic.expiresAt < new Date()) return { valid: false, reason: 'expired' }

  return { valid: true, agentAlias: lic.agentAlias, sectors: lic.sectors, projectId: lic.projectId }
})
