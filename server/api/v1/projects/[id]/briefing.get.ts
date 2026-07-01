// GET /api/v1/projects/:id/briefing?operation=active — one interface for all project
// intel (Briefing / The Archive hand-off, §7). Layered: vision → operation → Q-equipment
// → knowledge summaries. Serves users and agents. §10 step 2.
import { and, eq, asc } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { resolveProjectActor } from '~~/server/utils/actor'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const projectId = getUuidParam(event)
  await resolveProjectActor(event, projectId)

  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  // Active (or named) operation.
  const opQuery = (getQuery(event).operation as string | undefined) ?? 'active'
  const ops = await db
    .select()
    .from(schema.operations)
    .where(eq(schema.operations.projectId, projectId))
  const operation =
    opQuery === 'active'
      ? (ops.find((o) => o.status === 'active') ?? null)
      : (ops.find((o) => o.key === opQuery) ?? null)

  // Q-equipment — only ACTIVE gates/harness/guidelines are in force, so a Briefing carries
  // only those. Pending (Planner-proposed) and inactive (M-retired) equipment is hidden. §Q.
  const gates = await db
    .select()
    .from(schema.qualityGates)
    .where(
      and(eq(schema.qualityGates.projectId, projectId), eq(schema.qualityGates.status, 'active')),
    )
  const harness = await db
    .select()
    .from(schema.harnessDefs)
    .where(
      and(eq(schema.harnessDefs.projectId, projectId), eq(schema.harnessDefs.status, 'active')),
    )
  const [guideline] = await db
    .select()
    .from(schema.designGuidelines)
    .where(
      and(
        eq(schema.designGuidelines.projectId, projectId),
        eq(schema.designGuidelines.themeKey, project.settings.activeThemeKey),
        eq(schema.designGuidelines.status, 'active'),
      ),
    )

  // The Archive: knowledge doc summaries ("peanuts & hay"), shallow → deep. Only certified
  // knowledge reaches a Briefing — quarantined/rejected facts never poison agents. §SENTINEL S4.
  const knowledge = await db
    .select()
    .from(schema.knowledgeDocs)
    .where(
      and(
        eq(schema.knowledgeDocs.projectId, projectId),
        eq(schema.knowledgeDocs.status, 'certified'),
      ),
    )
    .orderBy(asc(schema.knowledgeDocs.level))

  // Open work snapshot.
  const missions = await db
    .select({ status: schema.missions.status })
    .from(schema.missions)
    .where(eq(schema.missions.projectId, projectId))
  const byStatus: Record<string, number> = {}
  for (const m of missions) byStatus[m.status] = (byStatus[m.status] ?? 0) + 1

  return {
    project: {
      key: project.key,
      name: project.name,
      vision: project.description,
      activeThemeKey: project.settings.activeThemeKey,
      sectors: project.settings.sectors,
    },
    operation: operation && {
      key: operation.key,
      codename: operation.codename,
      objective: operation.objective,
      status: operation.status,
      sectorsInScope: operation.sectorsInScope,
      successCriteria: operation.successCriteria,
      briefingSummary: operation.briefingSummary,
    },
    qBranch: {
      qualityGates: gates.map((g) => ({
        key: g.key,
        name: g.name,
        appliesToStatus: g.appliesToStatus,
        rule: g.rule,
      })),
      harness: harness.map((h) => ({ key: h.key, commands: h.commands })),
      designGuideline: guideline ? { themeKey: guideline.themeKey, title: guideline.title } : null,
    },
    archive: {
      coldReadRequired: project.settings.coldReadRequired,
      knowledge: knowledge.map((k) => ({ path: k.path, level: k.level, summary: k.summary })),
    },
    workload: byStatus,
  }
})
