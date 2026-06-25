// Citadel Ops — auth context & permission gates (Moneypenny, §15).
// Three levels: Platform (super_admin) → Organization (manager/contributor/viewer)
// → Project (per-project membership). Manager sees all org projects implicitly;
// contributor/viewer need an explicit ProjectMembership.
import type { H3Event } from 'h3'
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '../db'

const { users, orgMemberships, projectMemberships, projects } = schema

export type SessionUser = {
  id: string
  email: string
  name: string
  systemRole: 'super_admin' | 'user'
}

export type OrgRole = 'manager' | 'contributor' | 'viewer'

// Resolves the signed-in user from the session (401 if absent).
export async function requireUser(event: H3Event): Promise<SessionUser> {
  const { user } = await requireUserSession(event)
  return user as SessionUser
}

export function isSuperAdmin(user: SessionUser): boolean {
  return user.systemRole === 'super_admin'
}

// The user's active org membership role, or null if not a member.
export async function getOrgRole(userId: string, orgId: string): Promise<OrgRole | null> {
  const [m] = await db.select().from(orgMemberships)
    .where(and(eq(orgMemberships.userId, userId), eq(orgMemberships.orgId, orgId), eq(orgMemberships.status, 'active')))
  return (m?.role as OrgRole) ?? null
}

// All org ids the user is an active member of.
export async function getUserOrgIds(userId: string): Promise<string[]> {
  const rows = await db.select({ orgId: orgMemberships.orgId }).from(orgMemberships)
    .where(and(eq(orgMemberships.userId, userId), eq(orgMemberships.status, 'active')))
  return rows.map(r => r.orgId)
}

// Projects the user can see: super_admin → all; manager → all in their orgs;
// contributor/viewer → only those with an explicit ProjectMembership.
export async function listAccessibleProjects(user: SessionUser) {
  if (isSuperAdmin(user)) return db.select().from(projects)

  const memberships = await db.select().from(orgMemberships)
    .where(and(eq(orgMemberships.userId, user.id), eq(orgMemberships.status, 'active')))
  const managerOrgIds = memberships.filter(m => m.role === 'manager').map(m => m.orgId)
  const memberOrgIds = memberships.map(m => m.orgId)

  const grantRows = await db.select({ projectId: projectMemberships.projectId }).from(projectMemberships)
    .where(eq(projectMemberships.userId, user.id))
  const grantedIds = grantRows.map(g => g.projectId)

  if (managerOrgIds.length === 0 && grantedIds.length === 0) return []

  const all = memberOrgIds.length ? await db.select().from(projects).where(inArray(projects.orgId, memberOrgIds)) : []
  return all.filter(p => managerOrgIds.includes(p.orgId) || grantedIds.includes(p.id))
}

type ProjectAccess = { user: SessionUser, project: typeof projects.$inferSelect, orgRole: OrgRole | null }

// Asserts the user may READ a project; returns the resolved context. 403 otherwise.
export async function assertProjectAccess(event: H3Event, projectId: string): Promise<ProjectAccess> {
  const user = await requireUser(event)
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId))
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  if (isSuperAdmin(user)) return { user, project, orgRole: null }

  const orgRole = await getOrgRole(user.id, project.orgId)
  if (!orgRole) throw createError({ statusCode: 403, statusMessage: 'Not a member of this organization' })
  if (orgRole === 'manager') return { user, project, orgRole }

  // contributor/viewer need explicit project membership.
  const [grant] = await db.select().from(projectMemberships)
    .where(and(eq(projectMemberships.projectId, projectId), eq(projectMemberships.userId, user.id)))
  if (!grant) throw createError({ statusCode: 403, statusMessage: 'No access to this project' })
  return { user, project, orgRole }
}

// Asserts the user may WRITE to a project (viewers are read-only). 403 otherwise.
export async function assertProjectWrite(event: H3Event, projectId: string): Promise<ProjectAccess> {
  const ctx = await assertProjectAccess(event, projectId)
  if (ctx.orgRole === 'viewer') throw createError({ statusCode: 403, statusMessage: 'Viewers are read-only' })
  return ctx
}

// Asserts the user is a manager of the org (or super_admin). 403 otherwise.
export async function assertOrgManager(event: H3Event, orgId: string): Promise<SessionUser> {
  const user = await requireUser(event)
  if (isSuperAdmin(user)) return user
  const role = await getOrgRole(user.id, orgId)
  if (role !== 'manager') throw createError({ statusCode: 403, statusMessage: 'Manager role required' })
  return user
}

// Helper: resolve a mission's project then assert write access.
export async function assertMissionWrite(event: H3Event, missionId: string) {
  const [m] = await db.select({ projectId: schema.missions.projectId }).from(schema.missions).where(eq(schema.missions.id, missionId))
  if (!m) throw createError({ statusCode: 404, statusMessage: 'Mission not found' })
  return assertProjectWrite(event, m.projectId)
}

export async function lookupUserByEmail(email: string) {
  const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase()))
  return u ?? null
}
