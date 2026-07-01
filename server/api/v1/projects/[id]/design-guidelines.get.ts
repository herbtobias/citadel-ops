// GET /api/v1/projects/:id/design-guidelines?theme=active|<key> — the Design Guideline in
// force for the active (or named) theme, plus the Theme registry. HQ users additionally get
// the full `guidelines` list (all themes, incl. inactive) to manage them. `guideline` is the
// ACTIVE one — an inactive guideline never reaches an agent. User or agent. §Q/§4.
import { and, eq, or, isNull } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { resolveProjectActor } from '~~/server/utils/actor'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const projectId = getUuidParam(event)
  const actor = await resolveProjectActor(event, projectId)

  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const requested = (getQuery(event).theme as string | undefined) ?? 'active'
  const themeKey = requested === 'active' ? project.settings.activeThemeKey : requested

  const all = await db
    .select()
    .from(schema.designGuidelines)
    .where(eq(schema.designGuidelines.projectId, projectId))

  // In force for the requested theme = the ACTIVE guideline (agents never see inactive ones).
  const active = all.find((g) => g.themeKey === themeKey && g.status === 'active')

  // Theme registry visible to this org (org-level or project-level entries).
  const themes = await db
    .select()
    .from(schema.themes)
    .where(
      or(
        eq(schema.themes.projectId, projectId),
        and(eq(schema.themes.orgId, project.orgId), isNull(schema.themes.projectId)),
      ),
    )

  return {
    activeThemeKey: project.settings.activeThemeKey,
    themeKey,
    guideline: active
      ? {
          id: active.id,
          title: active.title,
          themeKey: active.themeKey,
          bodyMarkdown: active.bodyMarkdown,
          version: active.version,
        }
      : null,
    // Management view (all themes, incl. inactive) — HQ users only.
    guidelines:
      actor.kind === 'user'
        ? all.map((g) => ({
            id: g.id,
            themeKey: g.themeKey,
            title: g.title,
            bodyMarkdown: g.bodyMarkdown,
            status: g.status,
          }))
        : undefined,
    themes: themes.map((t) => ({ key: t.key, name: t.name, tokens: t.tokens })),
  }
})
