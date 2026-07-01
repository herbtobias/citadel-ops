// Citadel Ops — Q-Branch equipment helpers (§Q). Item endpoints (PATCH/DELETE a Gate,
// Harness or Design Guideline) resolve the row's project and assert the caller is a manager
// of its org — the same M-Desk authority that issues licenses.
import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db'
import { assertOrgManager, type SessionUser } from './auth'

// Fetch a project (404 if absent) then assert the caller is a manager of its org (403 otherwise).
export async function assertQBranchManager(
  event: H3Event,
  projectId: string,
): Promise<SessionUser> {
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  return assertOrgManager(event, project.orgId)
}

// The status-change verb for The Wire, given the new status on a PATCH.
export function statusEvent(entity: string, status: 'active' | 'inactive' | undefined): string {
  if (status === 'active') return `${entity}_activated`
  if (status === 'inactive') return `${entity}_deactivated`
  return `${entity}_updated`
}
