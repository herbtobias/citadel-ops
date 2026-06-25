// POST /api/v1/missions/:id/transition — state-machine-validated status change.
// The one place transitions are enforced (REST + later MCP share it). §12.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { transitionSchema, parseBody } from '~~/server/utils/validation'
import { assertTransition } from '~~/server/utils/state-machine'
import { assertMissionWrite } from '~~/server/utils/auth'
import { checkGates } from '~~/server/utils/gates'
import { logActivity } from '~~/server/utils/activity'
import { serializeMissionById } from '~~/server/utils/dto'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { user } = await assertMissionWrite(event, id)
  const body = await parseBody(event, transitionSchema)

  const [m] = await db.select().from(schema.missions).where(eq(schema.missions.id, id))
  if (!m) throw createError({ statusCode: 404, statusMessage: 'Mission not found' })

  assertTransition(m.status, body.to)
  // Q-Branch gates for the target status (Cold Read, harness, artifacts, …).
  await checkGates(m.projectId, m, body.to)

  const patch: Partial<typeof schema.missions.$inferInsert> = {
    status: body.to,
    updatedAt: new Date(),
  }
  if (body.outcome !== undefined) patch.outcome = body.outcome
  if (body.result !== undefined) patch.result = body.result
  if (body.to === 'done') {
    patch.completedAt = new Date()
    if (!body.result) patch.result = 'success'
  }

  await db.update(schema.missions).set(patch).where(eq(schema.missions.id, id))

  await logActivity({
    projectId: m.projectId, missionId: id, actorType: 'human', actorUserId: user.id,
    event: 'transitioned', fromStatus: m.status, toStatus: body.to,
    message: body.message ?? `${m.status} → ${body.to}`,
  })

  return serializeMissionById(id)
})
