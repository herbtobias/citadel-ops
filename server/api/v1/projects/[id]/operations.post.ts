// POST /api/v1/projects/:id/operations — plan a new Operation (sprint). Manager only.
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { parseBody, sectorSchema } from '~~/server/utils/validation'
import { assertOrgManager } from '~~/server/utils/auth'
import { logActivity } from '~~/server/utils/activity'
import { serializeOperation } from '~~/server/utils/dto'

const schema_ = z.object({
  codename: z.string().min(1).max(120),
  objective: z.string().max(2000).optional().default(''),
  sectorsInScope: z.array(sectorSchema).optional().default([]),
  capacityPoints: z.number().int().positive().nullable().optional(),
  successCriteria: z.array(z.string()).optional().default([]),
  activate: z.boolean().optional().default(false),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')!
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  const manager = await assertOrgManager(event, project.orgId)
  const body = await parseBody(event, schema_)

  // Next OP-N key.
  const existing = await db.select({ key: schema.operations.key }).from(schema.operations).where(eq(schema.operations.projectId, projectId))
  const maxNum = existing.reduce((m, r) => Math.max(m, Number.parseInt(r.key.split('-')[1] ?? '0', 10) || 0), 0)
  const key = `OP-${maxNum + 1}`

  const [op] = await db.insert(schema.operations).values({
    projectId, key, codename: body.codename, objective: body.objective,
    status: body.activate ? 'active' : 'planned',
    sectorsInScope: body.sectorsInScope, capacityPoints: body.capacityPoints ?? null,
    successCriteria: body.successCriteria, createdByUserId: manager.id,
  }).returning()

  await logActivity({
    projectId, operationId: op.id, actorType: 'human', actorUserId: manager.id,
    event: 'operation_planned', message: `Planned ${key}: ${body.codename}`,
  })

  setResponseStatus(event, 201)
  return serializeOperation(op)
})
