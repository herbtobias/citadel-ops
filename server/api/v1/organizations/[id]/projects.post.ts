// POST /api/v1/organizations/:id/projects — create a project in an org (manager).
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { parseBody, sectorSchema } from '~~/server/utils/validation'
import { assertOrgManager } from '~~/server/utils/auth'
import { serializeProject } from '~~/server/utils/dto'
import type { ProjectSettings } from '~~/server/db/schema'

const schema_ = z.object({
  key: z
    .string()
    .min(1)
    .max(8)
    .regex(/^[A-Z][A-Z0-9]*$/, 'uppercase letters/digits, e.g. WEB'),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().default(''),
  sectors: z.array(sectorSchema).min(1).optional(),
  activeThemeKey: z.enum(['defcon-5', 'cyberwar']).optional(),
  coldReadRequired: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, 'id')!
  await assertOrgManager(event, orgId)
  const body = await parseBody(event, schema_)

  const [dup] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.orgId, orgId), eq(schema.projects.key, body.key)))
  if (dup)
    throw createError({
      statusCode: 409,
      statusMessage: `Project key ${body.key} already exists in this org`,
    })

  const settings: ProjectSettings = {
    statusColumns: [
      'backlog',
      'designing',
      'cold_read',
      'ready',
      'in_progress',
      'in_review',
      'done',
    ],
    sectors: body.sectors ?? ['FRONTEND', 'BACKEND', 'QA', 'INFRA', 'SECURITY', 'DESIGN'],
    coldReadRequired: body.coldReadRequired ?? true,
    activeThemeKey: body.activeThemeKey ?? 'defcon-5',
    maxHandoffDepth: 5,
    maxMissionsPerAgent: 3,
    rateLimits: { callsPerMin: 120 },
  }

  const [project] = await db
    .insert(schema.projects)
    .values({
      orgId,
      key: body.key,
      name: body.name,
      description: body.description,
      settings,
    })
    .returning()
  if (!project) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

  setResponseStatus(event, 201)
  return serializeProject(project)
})
