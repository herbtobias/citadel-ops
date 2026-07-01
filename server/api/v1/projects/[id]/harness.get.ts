// GET /api/v1/projects/:id/harness — Harness Definitions (build/test/lint). Agents see only
// ACTIVE harnesses; HQ users see all (incl. inactive) to manage them. §Q.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { resolveProjectActor } from '~~/server/utils/actor'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const projectId = getUuidParam(event)
  const actor = await resolveProjectActor(event, projectId)
  const rows = await db
    .select()
    .from(schema.harnessDefs)
    .where(eq(schema.harnessDefs.projectId, projectId))
  const visible = actor.kind === 'agent' ? rows.filter((h) => h.status === 'active') : rows
  return visible.map((h) => ({
    id: h.id,
    key: h.key,
    name: h.name,
    commands: h.commands,
    notes: h.notes,
    status: h.status,
  }))
})
