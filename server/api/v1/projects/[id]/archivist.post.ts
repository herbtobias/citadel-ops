// POST /api/v1/projects/:id/archivist — refresh The Archive (§24). Summarizes recently
// completed missions into a knowledge doc so the Archive context stays current. Manager only.
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertOrgManager } from '~~/server/utils/auth'
import { logActivity } from '~~/server/utils/activity'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const projectId = getUuidParam(event)
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  const manager = await assertOrgManager(event, project.orgId)

  const done = await db
    .select()
    .from(schema.missions)
    .where(and(eq(schema.missions.projectId, projectId), eq(schema.missions.status, 'done')))
  const summary = done.length
    ? `Completed (${done.length}): ${done
        .map((m) => `${m.key} ${m.title}`)
        .slice(0, 30)
        .join('; ')}`
    : 'No completed missions yet.'

  const path = 'ARCHIVE/completed'
  const [existing] = await db
    .select()
    .from(schema.knowledgeDocs)
    .where(and(eq(schema.knowledgeDocs.projectId, projectId), eq(schema.knowledgeDocs.path, path)))

  if (existing) {
    await db
      .update(schema.knowledgeDocs)
      .set({ summary, updatedAt: new Date() })
      .where(eq(schema.knowledgeDocs.id, existing.id))
  } else {
    await db.insert(schema.knowledgeDocs).values({ projectId, path, level: 0, summary })
  }

  await logActivity({
    projectId,
    actorType: 'human',
    actorUserId: manager.id,
    event: 'archive_refreshed',
    message: `Archivist refreshed (${done.length} completed missions)`,
  })

  return { ok: true, completedMissions: done.length, summary }
})
