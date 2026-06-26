// DELETE /api/v1/projects/:id/knowledge?path=<path> | ?prefix=<prefix> — HQ purges
// Archive docs. `path` removes one doc; `prefix` removes a subtree (e.g. `INTEL/` to
// drop all elicited operator intel). Manager only. Hard delete, logged to The Wire. §24/§26.
import { and, eq, like } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertOrgManager } from '~~/server/utils/auth'
import { logActivity } from '~~/server/utils/activity'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const projectId = getUuidParam(event)
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  const manager = await assertOrgManager(event, project.orgId)

  const q = getQuery(event)
  const path = (q.path as string | undefined)?.trim()
  const prefix = (q.prefix as string | undefined)?.trim()
  if (!path && !prefix)
    throw createError({ statusCode: 422, statusMessage: 'Provide `path` or `prefix`' })

  const where = path
    ? and(eq(schema.knowledgeDocs.projectId, projectId), eq(schema.knowledgeDocs.path, path))
    : and(
        eq(schema.knowledgeDocs.projectId, projectId),
        like(schema.knowledgeDocs.path, `${prefix}%`),
      )

  const doomed = await db
    .select({ path: schema.knowledgeDocs.path })
    .from(schema.knowledgeDocs)
    .where(where)
  if (doomed.length === 0) throw createError({ statusCode: 404, statusMessage: 'No matching docs' })

  await db.delete(schema.knowledgeDocs).where(where)

  const target = path ? `doc ${path}` : `subtree ${prefix}*`
  await logActivity({
    projectId,
    actorType: 'human',
    actorUserId: manager.id,
    event: 'knowledge_deleted',
    message: `Purged Archive ${target} (${doomed.length})`,
    metadata: { path, prefix, count: doomed.length },
  })

  return { ok: true, deleted: doomed.length, paths: doomed.map((d) => d.path) }
})
