// GET /api/v1/agent/knowledge — read the full Archive (KnowledgeDocs incl. bodyMarkdown)
// for the License's project. Any valid project-bound License may read; the Planner uses
// this to deep-read what the Scout/Interrogator filed before planning against it. The
// Briefing only carries summaries — this carries the full text. §7/§24.
import { and, asc, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { requireLicense } from '~~/server/utils/license'

export default defineEventHandler(async (event) => {
  const lic = await requireLicense(event)
  if (!lic.projectId)
    throw createError({ statusCode: 422, statusMessage: 'License is not bound to a project' })

  // Agents (incl. the Planner) read only certified knowledge — quarantine never poisons
  // planning. HQ reviews quarantined docs via the human-facing GET /projects/:id/knowledge.
  const docs = await db
    .select()
    .from(schema.knowledgeDocs)
    .where(
      and(
        eq(schema.knowledgeDocs.projectId, lic.projectId),
        eq(schema.knowledgeDocs.status, 'certified'),
      ),
    )
    .orderBy(asc(schema.knowledgeDocs.level), asc(schema.knowledgeDocs.path))

  return docs.map((d) => ({
    path: d.path,
    level: d.level,
    summary: d.summary,
    bodyMarkdown: d.bodyMarkdown,
    parentId: d.parentId,
  }))
})
