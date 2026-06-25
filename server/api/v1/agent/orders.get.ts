// GET /api/v1/agent/orders — unconsumed control orders for this agent (check_orders,
// §10 step 3). Matches targeted, sector-wide, and broadcast orders; marks them
// consumed and returns them. A `stand_down` tells the agent to stop.
import { and, eq, isNull, or, inArray } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { requireLicense } from '~~/server/utils/license'

export default defineEventHandler(async (event) => {
  const lic = await requireLicense(event)
  if (!lic.projectId) return { orders: [], standDown: false }

  const sectors = lic.sectors as string[]
  const pending = await db.select().from(schema.controlOrders).where(and(
    eq(schema.controlOrders.projectId, lic.projectId),
    isNull(schema.controlOrders.consumedAt),
    or(
      eq(schema.controlOrders.targetLicenseId, lic.id),
      eq(schema.controlOrders.broadcast, true),
      sectors.length ? inArray(schema.controlOrders.targetSector, sectors as any) : undefined,
    ),
  ))

  if (pending.length) {
    await db.update(schema.controlOrders).set({ consumedAt: new Date() })
      .where(inArray(schema.controlOrders.id, pending.map(o => o.id)))
  }

  return {
    orders: pending.map(o => ({ id: o.id, type: o.type, payload: o.payload })),
    standDown: pending.some(o => o.type === 'stand_down'),
  }
})
