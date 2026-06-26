// DELETE /api/v1/projects/:id?confirm=<KEY> — purge a project and ALL its data
// (missions, operations, dossiers, the Archive, references, artifacts, comments,
// The Wire, gates, themes, licenses…) via the DB cascade. Manager only. Irreversible:
// requires ?confirm=<project key> so a stray call can't wipe a project. §26 (GDPR purge).
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertOrgManager } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')!
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  await assertOrgManager(event, project.orgId)

  const confirm = getQuery(event).confirm as string | undefined
  if (confirm !== project.key)
    throw createError({
      statusCode: 422,
      statusMessage: `Irreversible. Pass ?confirm=${project.key} to purge this project.`,
    })

  // Count what goes (for the response) before the cascade removes it.
  const count = async (table: any) =>
    (await db.select({ id: table.id }).from(table).where(eq(table.projectId, projectId))).length
  const deleted = {
    missions: await count(schema.missions),
    operations: await count(schema.operations),
    knowledgeDocs: await count(schema.knowledgeDocs),
    dossiers: await count(schema.dossiers),
    activity: await count(schema.activityLog),
  }

  // The cascade (onDelete: 'cascade' on every project FK) removes all children.
  await db.delete(schema.projects).where(eq(schema.projects.id, projectId))

  return { ok: true, purged: { project: project.key }, deleted }
})
