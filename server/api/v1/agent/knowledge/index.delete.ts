// DELETE /api/v1/agent/knowledge?path=<path> — Scout / Interrogator retracts a
// KnowledgeDoc it filed into The Archive (e.g. a stale or wrong recon doc, or an
// `INTEL/*` entry the operator asked to remove). Requires the `recon` scope. Hard
// delete; the removal itself is recorded in The Wire so HQ keeps an audit trail. §24.
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { requireLicense, assertReconScope } from '~~/server/utils/license'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const lic = await requireLicense(event)
  assertReconScope(lic)
  if (!lic.projectId)
    throw createError({ statusCode: 422, statusMessage: 'License is not bound to a project' })
  const projectId = lic.projectId

  const path = (getQuery(event).path as string | undefined)?.trim()
  if (!path) throw createError({ statusCode: 422, statusMessage: 'Query param `path` is required' })

  const [doc] = await db
    .select()
    .from(schema.knowledgeDocs)
    .where(and(eq(schema.knowledgeDocs.projectId, projectId), eq(schema.knowledgeDocs.path, path)))
  if (!doc) throw createError({ statusCode: 404, statusMessage: `Knowledge doc ${path} not found` })

  await db.delete(schema.knowledgeDocs).where(eq(schema.knowledgeDocs.id, doc.id))

  await logActivity({
    projectId,
    actorType: 'agent',
    actorLicenseId: lic.id,
    event: 'knowledge_deleted',
    message: `Retracted Archive doc ${path}`,
    metadata: { path },
  })

  return { ok: true, path, deleted: 1 }
})
