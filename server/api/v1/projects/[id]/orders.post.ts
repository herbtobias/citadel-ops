// POST /api/v1/projects/:id/orders — issue a control order to agents (manager).
// Targeted (license), sector-wide, or broadcast. §9.
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { parseBody, sectorSchema } from '~~/server/utils/validation'
import { assertOrgManager } from '~~/server/utils/auth'
import { logActivity } from '~~/server/utils/activity'

const schema_ = z.object({
  type: z.enum(['pause', 'resume', 'stand_down', 'reprioritize', 'redirect', 'message']),
  targetLicenseId: z.string().uuid().optional(),
  targetSector: sectorSchema.optional(),
  broadcast: z.boolean().optional().default(false),
  payload: z.record(z.string(), z.unknown()).optional(),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')!
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  const manager = await assertOrgManager(event, project.orgId)

  const body = await parseBody(event, schema_)
  const [order] = await db.insert(schema.controlOrders).values({
    projectId, type: body.type,
    targetLicenseId: body.targetLicenseId ?? null,
    targetSector: body.targetSector ?? null,
    broadcast: body.broadcast,
    payload: body.payload ?? null,
    issuedByUserId: manager.id,
  }).returning()

  await logActivity({
    projectId, actorType: 'human', actorUserId: manager.id,
    event: 'order_issued', message: `Order: ${body.type}`,
    metadata: { orderId: order.id, type: body.type },
  })

  setResponseStatus(event, 201)
  return { id: order.id, type: order.type }
})
