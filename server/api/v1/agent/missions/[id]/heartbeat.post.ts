// POST /api/v1/agent/missions/:id/heartbeat — extend the lease on a claimed mission.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { requireLicense, LEASE_MS } from '~~/server/utils/license'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const lic = await requireLicense(event)

  const [m] = await db.select().from(schema.missions).where(eq(schema.missions.id, id))
  if (!m) throw createError({ statusCode: 404, statusMessage: 'Mission not found' })
  if (m.claimedByLicenseId !== lic.id) throw createError({ statusCode: 403, statusMessage: 'Mission not claimed by this license' })

  const now = new Date()
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS)
  await db.update(schema.missions).set({ heartbeatAt: now, leaseExpiresAt }).where(eq(schema.missions.id, id))
  return { ok: true, leaseExpiresAt }
})
