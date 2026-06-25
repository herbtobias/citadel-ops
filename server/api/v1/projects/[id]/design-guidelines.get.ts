// GET /api/v1/projects/:id/design-guidelines?theme=active|<key> — Design Guidelines
// for the active (or named) theme, plus the Theme registry. User or agent. §4.
import { and, eq, or, isNull } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { resolveProjectActor } from '~~/server/utils/actor'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')!
  await resolveProjectActor(event, projectId)

  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const requested = (getQuery(event).theme as string | undefined) ?? 'active'
  const themeKey = requested === 'active' ? project.settings.activeThemeKey : requested

  const guidelines = await db.select().from(schema.designGuidelines)
    .where(and(eq(schema.designGuidelines.projectId, projectId), eq(schema.designGuidelines.themeKey, themeKey)))

  // Theme registry visible to this org (org-level or project-level entries).
  const themes = await db.select().from(schema.themes).where(or(
    eq(schema.themes.projectId, projectId),
    and(eq(schema.themes.orgId, project.orgId), isNull(schema.themes.projectId)),
  ))

  return {
    activeThemeKey: project.settings.activeThemeKey,
    themeKey,
    guideline: guidelines[0]
      ? { title: guidelines[0].title, themeKey: guidelines[0].themeKey, bodyMarkdown: guidelines[0].bodyMarkdown, version: guidelines[0].version }
      : null,
    themes: themes.map(t => ({ key: t.key, name: t.name, tokens: t.tokens })),
  }
})
