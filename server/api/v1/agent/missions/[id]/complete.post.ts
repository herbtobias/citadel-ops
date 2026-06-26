// POST /api/v1/agent/missions/:id/complete — agent completes a claimed mission.
// (Q-gate enforcement lands in P5.) Releases the lease, closes the Deployment.
import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { getUuidParam, parseBody } from '~~/server/utils/validation'
import { requireLicense, withIdempotency } from '~~/server/utils/license'
import { assertTransition } from '~~/server/utils/state-machine'
import { checkGates } from '~~/server/utils/gates'
import { logActivity } from '~~/server/utils/activity'
import { serializeMissionById } from '~~/server/utils/dto'

const schema_ = z.object({
  outcome: z.string().max(2000).optional(),
  result: z.enum(['success', 'failed']).optional().default('success'),
})

export default defineEventHandler(async (event) => {
  const id = getUuidParam(event)
  const lic = await requireLicense(event)
  const body = await parseBody(event, schema_)
  const idemKey = getHeader(event, 'idempotency-key') || undefined

  const [m] = await db.select().from(schema.missions).where(eq(schema.missions.id, id))
  if (!m) throw createError({ statusCode: 404, statusMessage: 'Mission not found' })
  if (m.claimedByLicenseId !== lic.id)
    throw createError({ statusCode: 403, statusMessage: 'Mission not claimed by this license' })

  assertTransition(m.status, 'done')
  // Enforce Q-Branch gates for completion (harness pass, artifacts, acceptance, §18).
  await checkGates(m.projectId, m, 'done')

  const run = async () => {
    const now = new Date()
    await db
      .update(schema.missions)
      .set({
        status: 'done',
        result: body.result,
        outcome: body.outcome ?? null,
        completedAt: now,
        updatedAt: now,
        leaseExpiresAt: null,
        heartbeatAt: null,
      })
      .where(eq(schema.missions.id, id))

    // Close the open deployment for this mission.
    await db
      .update(schema.deployments)
      .set({ runnerStatus: body.result === 'failed' ? 'failed' : 'succeeded', finishedAt: now })
      .where(and(eq(schema.deployments.missionId, id), isNull(schema.deployments.finishedAt)))

    await logActivity({
      projectId: m.projectId,
      missionId: id,
      actorType: 'agent',
      actorLicenseId: lic.id,
      event: 'completed',
      fromStatus: m.status,
      toStatus: 'done',
      message: `${lic.agentAlias} completed mission (${body.result})`,
    })
    const mission = await serializeMissionById(id)
    return { result: mission, resultRef: id }
  }

  return withIdempotency(idemKey, 'complete', run)
})
