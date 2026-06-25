// Citadel Ops — in-app notifications (§13). Fan out to the people who can act:
// the project's org managers + members with explicit project access.
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db'

const { projects, orgMemberships, projectMemberships, notifications } = schema

type NotificationType = (typeof schema.notificationType.enumValues)[number]

export async function notifyProject(projectId: string, type: NotificationType, payload: Record<string, unknown>) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId))
  if (!project) return

  const managers = await db.select({ userId: orgMemberships.userId }).from(orgMemberships)
    .where(and(eq(orgMemberships.orgId, project.orgId), eq(orgMemberships.role, 'manager'), eq(orgMemberships.status, 'active')))
  const members = await db.select({ userId: projectMemberships.userId }).from(projectMemberships)
    .where(eq(projectMemberships.projectId, projectId))

  const userIds = [...new Set([...managers.map(m => m.userId), ...members.map(m => m.userId)])]
  if (userIds.length === 0) return

  await db.insert(notifications).values(userIds.map(userId => ({ userId, projectId, type, payload })))
}
