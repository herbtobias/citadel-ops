// GET /api/v1/projects/:id/agents — agent roster (licenses + current mission).
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertProjectAccess } from '~~/server/utils/auth'
import { serializeAgent } from '~~/server/utils/dto'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const id = getUuidParam(event)
  await assertProjectAccess(event, id)
  const licRows = await db.select().from(schema.licenses).where(eq(schema.licenses.projectId, id))
  if (licRows.length === 0) return []

  // Current mission per license = an in-progress mission it has claimed.
  const active = await db
    .select({ key: schema.missions.key, lic: schema.missions.claimedByLicenseId })
    .from(schema.missions)
    .where(
      and(
        eq(schema.missions.projectId, id),
        eq(schema.missions.status, 'in_progress'),
        inArray(
          schema.missions.claimedByLicenseId,
          licRows.map((l) => l.id),
        ),
      ),
    )
  const currentByLic = new Map(active.filter((a) => a.lic).map((a) => [a.lic!, a.key]))

  return licRows.map((l) => serializeAgent(l, currentByLic.get(l.id) ?? null))
})
