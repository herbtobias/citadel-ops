// GET /api/v1/projects/:id/knowledge — read The Archive (KnowledgeDocs incl. full
// bodyMarkdown) for HQ. Any project member may read; this is the human-facing
// counterpart to the agent's GET /api/v1/agent/knowledge. The Briefing only carries
// summaries — this carries the full text so HQ can browse what the Scout filed. §7/§24.
import { asc, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertProjectAccess } from '~~/server/utils/auth'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const projectId = getUuidParam(event)
  await assertProjectAccess(event, projectId)

  const docs = await db
    .select()
    .from(schema.knowledgeDocs)
    .where(eq(schema.knowledgeDocs.projectId, projectId))
    .orderBy(asc(schema.knowledgeDocs.level), asc(schema.knowledgeDocs.path))

  return docs.map((d) => ({
    id: d.id,
    path: d.path,
    level: d.level,
    summary: d.summary,
    bodyMarkdown: d.bodyMarkdown,
    parentId: d.parentId,
    updatedAt: d.updatedAt,
  }))
})
