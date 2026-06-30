// GET /api/v1/projects/:id/licenses — license roster (no keys/hashes). Access-gated.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertProjectAccess } from '~~/server/utils/auth'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const projectId = getUuidParam(event)
  await assertProjectAccess(event, projectId)

  const rows = await db
    .select({
      lic: schema.licenses,
      ownerName: schema.users.name,
      ownerEmail: schema.users.email,
    })
    .from(schema.licenses)
    .leftJoin(schema.users, eq(schema.users.id, schema.licenses.ownerUserId))
    .where(eq(schema.licenses.projectId, projectId))
  return rows.map(({ lic: l, ownerName, ownerEmail }) => ({
    id: l.id,
    agentAlias: l.agentAlias,
    sectors: l.sectors,
    scopes: l.scopes,
    kind: l.kind,
    parentLicenseId: l.parentLicenseId,
    // Who owns this credential (the M) — distinguishes multiple managers' provisioning keys.
    ownerUserId: l.ownerUserId,
    ownerName: ownerName ?? null,
    ownerEmail: ownerEmail ?? null,
    status: l.status,
    issuedAt: l.issuedAt,
    expiresAt: l.expiresAt,
    revokedAt: l.revokedAt,
    lastSeenAt: l.lastSeenAt,
  }))
})
