// Citadel Ops — DB → frontend DTO mappers. Produces the exact shapes the HQ
// frontend already consumes (app/types/index.ts) so stores swap mock → $fetch
// with no component changes.
import { eq, inArray } from 'drizzle-orm'
import { db, schema } from '../db'

const { projects, operations, missions, licenses, references, artifacts, comments } = schema

type Row<T extends { $inferSelect: unknown }> = T['$inferSelect']

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null)

export function serializeProject(p: Row<typeof projects>) {
  const s = p.settings
  return {
    id: p.id,
    orgId: p.orgId,
    key: p.key,
    name: p.name,
    description: p.description,
    activeThemeKey: s.activeThemeKey,
    statusColumns: s.statusColumns,
    sectors: s.sectors,
  }
}

export function serializeOperation(o: Row<typeof operations>) {
  return {
    id: o.id,
    key: o.key,
    projectId: o.projectId,
    codename: o.codename,
    objective: o.objective,
    status: o.status,
    startsAt: iso(o.startsAt),
    endsAt: iso(o.endsAt),
    capacityPoints: o.capacityPoints,
    sectorsInScope: o.sectorsInScope,
    briefingSummary: o.briefingSummary,
    successCriteria: o.successCriteria,
  }
}

// Builds full Mission DTOs (with links, artifacts, agent alias, comment counts)
// for all missions in a project — bulk joins, no N+1.
export async function serializeProjectMissions(projectId: string) {
  const rows = await db.select().from(missions).where(eq(missions.projectId, projectId))
  return hydrateMissions(rows)
}

export async function serializeMissionById(id: string) {
  const [row] = await db.select().from(missions).where(eq(missions.id, id))
  if (!row) return null
  const [m] = await hydrateMissions([row])
  return m
}

async function hydrateMissions(rows: Row<typeof missions>[]) {
  if (rows.length === 0) return []
  const missionIds = rows.map(m => m.id)
  const projectId = rows[0]!.projectId

  // Bulk: licenses (alias), references (links), artifacts, comment counts.
  const licIds = [...new Set(rows.map(m => m.claimedByLicenseId).filter(Boolean) as string[])]
  const licRows = licIds.length
    ? await db.select().from(licenses).where(inArray(licenses.id, licIds))
    : []
  const aliasById = new Map(licRows.map(l => [l.id, l.agentAlias]))

  // References sourced from these missions + the operation "part_of" link.
  const refRows = await db.select().from(references).where(eq(references.projectId, projectId))
  // Resolve target ids → keys for both missions and operations in this project.
  const projMissions = await db.select({ id: missions.id, key: missions.key }).from(missions).where(eq(missions.projectId, projectId))
  const projOps = await db.select({ id: operations.id, key: operations.key }).from(operations).where(eq(operations.projectId, projectId))
  const keyById = new Map<string, string>([
    ...projMissions.map(m => [m.id, m.key] as const),
    ...projOps.map(o => [o.id, o.key] as const),
  ])

  const artRows = await db.select().from(artifacts).where(inArray(artifacts.missionId, missionIds))
  const artByMission = new Map<string, Row<typeof artifacts>[]>()
  for (const a of artRows) {
    const list = artByMission.get(a.missionId) ?? []
    list.push(a)
    artByMission.set(a.missionId, list)
  }

  const commentRows = await db.select({ missionId: comments.missionId }).from(comments).where(inArray(comments.missionId, missionIds))
  const commentCount = new Map<string, number>()
  for (const c of commentRows) commentCount.set(c.missionId, (commentCount.get(c.missionId) ?? 0) + 1)

  return rows.map((m) => {
    const links = refRows
      .filter(r => r.sourceKind === 'mission' && r.sourceId === m.id)
      .map(r => ({
        linkType: r.linkType,
        targetKind: r.targetKind,
        targetKey: keyById.get(r.targetId) ?? r.targetId,
        note: r.note ?? undefined,
      }))
    // Synthesize the operation "part_of" link the frontend expects.
    if (m.operationId && keyById.has(m.operationId)) {
      links.unshift({ linkType: 'part_of', targetKind: 'operation', targetKey: keyById.get(m.operationId)!, note: undefined })
    }

    return {
      id: m.id,
      key: m.key,
      projectId: m.projectId,
      operationId: m.operationId,
      codename: m.codename,
      title: m.title,
      objective: m.objective,
      briefing: m.briefing,
      type: m.type,
      sector: m.sector,
      requiredSkills: m.requiredSkills,
      status: m.status,
      priority: m.priority,
      estimatePoints: m.estimatePoints,
      orderIndex: m.orderIndex,
      acceptanceCriteria: m.acceptanceCriteria,
      dossierId: m.dossierId,
      parentId: m.parentId,
      handoffDepth: m.handoffDepth,
      sharedContext: m.sharedContext ?? null,
      links,
      artifacts: (artByMission.get(m.id) ?? []).map(a => ({ id: a.id, kind: a.kind, url: a.url, label: a.label })),
      claimedByAlias: m.claimedByLicenseId ? aliasById.get(m.claimedByLicenseId) ?? null : null,
      outcome: m.outcome,
      result: m.result,
      commentCount: commentCount.get(m.id) ?? 0,
      createdAt: iso(m.createdAt)!,
      updatedAt: iso(m.updatedAt)!,
      completedAt: iso(m.completedAt),
    }
  })
}

export function serializeAgent(l: Row<typeof licenses>, currentMissionKey: string | null) {
  return {
    alias: l.agentAlias,
    sectors: l.sectors,
    status: l.status === 'active' ? (currentMissionKey ? 'active' : 'idle') : 'revoked',
    lastSeen: iso(l.lastSeenAt),
    currentMissionKey,
  }
}
