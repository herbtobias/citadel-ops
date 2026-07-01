// POST /api/v1/agent/knowledge — Scout / Interrogator: write a KnowledgeDoc into The
// Archive when onboarding a brownfield project. Requires the `recon` scope. Docs are
// upserted per (project, path); `parentPath` nests them. Every write is logged to The
// Wire so HQ has an audit trail of what was learned. §7/§24.
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { agentWriteKnowledgeSchema, parseBody } from '~~/server/utils/validation'
import { requireLicense, assertReconScope, withIdempotency } from '~~/server/utils/license'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const lic = await requireLicense(event)
  assertReconScope(lic)
  if (!lic.projectId)
    throw createError({ statusCode: 422, statusMessage: 'License is not bound to a project' })
  const projectId = lic.projectId
  const body = await parseBody(event, agentWriteKnowledgeSchema)
  const idemKey = getHeader(event, 'idempotency-key') || undefined

  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  // Resolve optional parent doc by path (within this project).
  let parentId: string | null = null
  if (body.parentPath) {
    const [parent] = await db
      .select()
      .from(schema.knowledgeDocs)
      .where(
        and(
          eq(schema.knowledgeDocs.projectId, projectId),
          eq(schema.knowledgeDocs.path, body.parentPath),
        ),
      )
    if (!parent)
      throw createError({
        statusCode: 404,
        statusMessage: `Knowledge doc ${body.parentPath} not found`,
      })
    parentId = parent.id
  }

  const run = async () => {
    const [existing] = await db
      .select()
      .from(schema.knowledgeDocs)
      .where(
        and(
          eq(schema.knowledgeDocs.projectId, projectId),
          eq(schema.knowledgeDocs.path, body.path),
        ),
      )

    let docId: string
    let created: boolean
    if (existing) {
      // A rewrite introduces new unverified content → re-quarantine (clear any prior verdict).
      await db
        .update(schema.knowledgeDocs)
        .set({
          summary: body.summary,
          bodyMarkdown: body.bodyMarkdown,
          level: body.level,
          parentId,
          status: 'quarantined',
          createdByLicenseId: lic.id,
          verifiedByLicenseId: null,
          verifiedByUserId: null,
          verifiedAt: null,
          rejectionReason: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.knowledgeDocs.id, existing.id))
      docId = existing.id
      created = false
    } else {
      const [row] = await db
        .insert(schema.knowledgeDocs)
        .values({
          projectId,
          path: body.path,
          level: body.level,
          summary: body.summary,
          bodyMarkdown: body.bodyMarkdown,
          parentId,
          status: 'quarantined',
          createdByLicenseId: lic.id,
        })
        .returning()
      if (!row) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })
      docId = row.id
      created = true
    }

    // Agent writes land in quarantine and never reach a Briefing until certified (§SENTINEL).
    // The Wire event drives a single HQ notification via the Leiter.
    await logActivity({
      projectId,
      actorType: 'agent',
      actorLicenseId: lic.id,
      event: 'knowledge_quarantined',
      message: `${created ? 'Filed' : 'Updated'} Archive doc ${body.path} — quarantined, awaiting certification`,
      metadata: { path: body.path, level: body.level },
    })

    return {
      result: { id: docId, path: body.path, level: body.level, created, status: 'quarantined' },
      resultRef: docId,
    }
  }

  setResponseStatus(event, 201)
  return withIdempotency(idemKey, 'agent-write-knowledge', run)
})
