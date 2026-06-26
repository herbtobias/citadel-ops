// POST /api/v1/agent/knowledge/finish — the Scout/Interrogator signals the end of a
// recon run. Logs `recon_completed` to The Wire; the event bus → Leiter then raises
// ONE `archive_updated` notification for HQ (instead of a bell per filed doc — a recon
// run writes many docs). Requires the `recon` scope. §7/§13.
import { count, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { requireLicense, assertReconScope } from '~~/server/utils/license'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const lic = await requireLicense(event)
  assertReconScope(lic)
  if (!lic.projectId)
    throw createError({ statusCode: 422, statusMessage: 'License is not bound to a project' })

  const [row] = await db
    .select({ n: count() })
    .from(schema.knowledgeDocs)
    .where(eq(schema.knowledgeDocs.projectId, lic.projectId))
  const docCount = row?.n ?? 0

  await logActivity({
    projectId: lic.projectId,
    actorType: 'agent',
    actorLicenseId: lic.id,
    event: 'recon_completed',
    message: `Scout finished recon — The Archive holds ${docCount} doc${docCount === 1 ? '' : 's'}`,
    metadata: { docCount },
  })

  setResponseStatus(event, 200)
  return { ok: true, docCount }
})
