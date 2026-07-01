// POST /api/v1/knowledge/:id/verify — the Fakten-Cold-Read: certify or reject a quarantined
// KnowledgeDoc so it can (or can never) reach a Briefing. §SENTINEL S3. Mirrors the plan-level
// Cold Read (dossiers/:id/cold-read) but for FACTS, not plans.
//
// Zero-context rule: the verifier must be a DIFFERENT actor than the author — a foreign agent
// (a validator) or an HQ user with write access. The License that wrote the doc can never
// certify its own content.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { getBearerToken, requireLicense } from '~~/server/utils/license'
import { assertProjectWrite } from '~~/server/utils/auth'
import { getUuidParam, parseBody, verifyKnowledgeSchema } from '~~/server/utils/validation'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const id = getUuidParam(event)
  const [doc] = await db.select().from(schema.knowledgeDocs).where(eq(schema.knowledgeDocs.id, id))
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'Knowledge doc not found' })

  const body = await parseBody(event, verifyKnowledgeSchema)

  // Dual auth + zero-context.
  let verifiedByLicenseId: string | null = null
  let verifiedByUserId: string | null = null
  if (getBearerToken(event)) {
    const lic = await requireLicense(event)
    if (lic.projectId && lic.projectId !== doc.projectId)
      throw createError({
        statusCode: 403,
        statusMessage: 'License is scoped to a different project',
      })
    if (lic.id === doc.createdByLicenseId)
      throw createError({
        statusCode: 403,
        statusMessage: 'Zero-context: the author License cannot certify its own doc',
      })
    verifiedByLicenseId = lic.id
  } else {
    const { user } = await assertProjectWrite(event, doc.projectId)
    verifiedByUserId = user.id
  }

  if (doc.status !== 'quarantined')
    throw createError({ statusCode: 409, statusMessage: `Doc is already ${doc.status}` })

  const certify = body.verdict === 'certify'
  await db
    .update(schema.knowledgeDocs)
    .set({
      status: certify ? 'certified' : 'rejected',
      verifiedByLicenseId,
      verifiedByUserId,
      verifiedAt: new Date(),
      rejectionReason: certify ? null : (body.reason ?? null),
      updatedAt: new Date(),
    })
    .where(eq(schema.knowledgeDocs.id, id))

  await logActivity({
    projectId: doc.projectId,
    actorType: verifiedByLicenseId ? 'agent' : 'human',
    actorLicenseId: verifiedByLicenseId,
    actorUserId: verifiedByUserId,
    event: certify ? 'knowledge_certified' : 'knowledge_rejected',
    message: `${certify ? 'Certified' : 'Rejected'} Archive doc ${doc.path}`,
    metadata: { path: doc.path, notes: body.notes ?? null },
  })

  return { id, path: doc.path, status: certify ? 'certified' : 'rejected' }
})
