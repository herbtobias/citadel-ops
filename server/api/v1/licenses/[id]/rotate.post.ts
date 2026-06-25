// POST /api/v1/licenses/:id/rotate — rotate an agent's key (§22). Returns the new key
// once; the old key stops working immediately. Manager only.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertOrgManager } from '~~/server/utils/auth'
import { generateLicenseKey, hashLicenseKey } from '~~/server/utils/license'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const [lic] = await db.select().from(schema.licenses).where(eq(schema.licenses.id, id))
  if (!lic) throw createError({ statusCode: 404, statusMessage: 'License not found' })
  if (lic.status !== 'active') throw createError({ statusCode: 422, statusMessage: 'Only active licenses can be rotated' })
  const manager = await assertOrgManager(event, lic.orgId)

  const key = generateLicenseKey()
  await db.update(schema.licenses).set({ hashedKey: hashLicenseKey(key) }).where(eq(schema.licenses.id, id))

  await logActivity({
    projectId: lic.projectId, actorType: 'human', actorUserId: manager.id,
    event: 'license_rotated', message: `Rotated key for ${lic.agentAlias}`, metadata: { licenseId: id },
  })

  return { id, agentAlias: lic.agentAlias, key }
})
