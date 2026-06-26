// Citadel Ops — planning helpers shared by the HQ (user) and Planner (agent) paths.
// Centralises the project-scoped key generation that mission/operation creation needs
// (was duplicated across the create endpoints).
import { eq } from 'drizzle-orm'
import { db, schema } from '../db'

// Next mission key for a project, e.g. WEB-48 (max numeric suffix + 1).
export async function nextMissionKey(projectId: string, projectKey: string): Promise<string> {
  const existing = await db
    .select({ key: schema.missions.key })
    .from(schema.missions)
    .where(eq(schema.missions.projectId, projectId))
  const maxNum = existing.reduce(
    (m, r) => Math.max(m, Number.parseInt(r.key.split('-')[1] ?? '0', 10) || 0),
    0,
  )
  return `${projectKey}-${maxNum + 1}`
}

// Next operation key for a project, e.g. OP-12 (max numeric suffix + 1).
export async function nextOperationKey(projectId: string): Promise<string> {
  const existing = await db
    .select({ key: schema.operations.key })
    .from(schema.operations)
    .where(eq(schema.operations.projectId, projectId))
  const maxNum = existing.reduce(
    (m, r) => Math.max(m, Number.parseInt(r.key.split('-')[1] ?? '0', 10) || 0),
    0,
  )
  return `OP-${maxNum + 1}`
}
