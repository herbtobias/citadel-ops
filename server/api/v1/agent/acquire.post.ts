// POST /api/v1/agent/acquire — the acquire handshake (§C). A provisioning key mints a
// short-lived, sector-scoped `session` license. The provisioning key is the only durable
// secret an operator keeps; the session license is ephemeral and held only by the
// caller's MCP process. §10 step 1 (provisioning variant).
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { requireLicense, mintSessionLicense } from '~~/server/utils/license'
import { parseBody, acquireLicenseSchema } from '~~/server/utils/validation'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const parent = await requireLicense(event, { allow: ['provisioning'] })
  const body = await parseBody(event, acquireLicenseSchema)
  const { license, key } = await mintSessionLicense(parent, body)

  const [project] = license.projectId
    ? await db.select().from(schema.projects).where(eq(schema.projects.id, license.projectId))
    : []

  await logActivity({
    projectId: license.projectId,
    actorType: 'agent',
    actorLicenseId: license.id,
    event: 'license_acquired',
    message: `${license.agentAlias} acquired a session license [${(license.sectors as string[]).join(', ')}]`,
    metadata: { parentLicenseId: parent.id, sessionLicenseId: license.id },
  })

  setResponseStatus(event, 201)
  // key shown only here — held by the MCP process for the session, never re-retrievable.
  return {
    key,
    agentAlias: license.agentAlias,
    sectors: license.sectors,
    scopes: license.scopes,
    expiresAt: license.expiresAt,
    project: project ? { id: project.id, key: project.key, name: project.name } : null,
  }
})
