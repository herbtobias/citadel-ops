// GET /api/v1/projects/:id/licenses — license roster (no keys/hashes). Access-gated.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertProjectAccess } from '~~/server/utils/auth'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const projectId = getUuidParam(event)
  await assertProjectAccess(event, projectId)

  const rows = await db
    .select()
    .from(schema.licenses)
    .where(eq(schema.licenses.projectId, projectId))
  return rows.map((l) => ({
    id: l.id,
    agentAlias: l.agentAlias,
    sectors: l.sectors,
    scopes: l.scopes,
    kind: l.kind,
    parentLicenseId: l.parentLicenseId,
    status: l.status,
    issuedAt: l.issuedAt,
    expiresAt: l.expiresAt,
    revokedAt: l.revokedAt,
    lastSeenAt: l.lastSeenAt,
  }))
})
