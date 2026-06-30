// Citadel Ops — shared Zod schemas (REST today, MCP later). §12/§16.
import { z } from 'zod'

export const sectorSchema = z.enum(['FRONTEND', 'BACKEND', 'QA', 'INFRA', 'SECURITY', 'DESIGN'])
export type Sector = z.infer<typeof sectorSchema>
export const scopeSchema = z.enum(['plan', 'recon'])

// Body for POST /api/v1/agent/acquire — a provisioning key mints a session license.
// All optional: sectors/scopes default to (a subset of) the provisioning key's ceiling.
export const acquireLicenseSchema = z.object({
  sectors: z.array(sectorSchema).optional(),
  scopes: z.array(scopeSchema).optional(),
  alias: z.string().min(1).max(40).optional(),
  ttlMinutes: z.number().int().positive().max(1440).optional(),
})
export const missionTypeSchema = z.enum([
  'design',
  'feature',
  'test',
  'bugfix',
  'spike',
  'chore',
  'research',
])
export const missionStatusSchema = z.enum([
  'backlog',
  'designing',
  'cold_read',
  'ready',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'cancelled',
])
export const prioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])

export const createMissionSchema = z.object({
  title: z.string().min(1).max(200),
  objective: z.string().max(2000).optional().default(''),
  briefing: z.string().max(20000).optional().default(''),
  type: missionTypeSchema.optional().default('feature'),
  sector: sectorSchema,
  priority: prioritySchema.optional().default('medium'),
  estimatePoints: z.number().int().positive().nullable().optional(),
  acceptanceCriteria: z.array(z.string()).optional().default([]),
  requiredSkills: z.array(z.string()).optional().default([]),
  operationId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  orderIndex: z.number().int().optional(),
})

export const updateMissionSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    objective: z.string().max(2000).optional(),
    briefing: z.string().max(20000).optional(),
    type: missionTypeSchema.optional(),
    sector: sectorSchema.optional(),
    priority: prioritySchema.optional(),
    estimatePoints: z.number().int().positive().nullable().optional(),
    acceptanceCriteria: z.array(z.string()).optional(),
    requiredSkills: z.array(z.string()).optional(),
    orderIndex: z.number().int().optional(),
    operationId: z.string().uuid().nullable().optional(),
  })
  .strict()

// ── Planner (agent) schemas ──
// Agents reason in keys (WEB-42, OP-1), not UUIDs, so the planning surface is
// key-based (matching link_missions). A Planner may file work straight into the
// backlog, or as `ready` to skip the design/cold-read gate for simple chores.
export const agentCreateMissionSchema = z.object({
  title: z.string().min(1).max(200),
  objective: z.string().max(2000).optional().default(''),
  briefing: z.string().max(20000).optional().default(''),
  type: missionTypeSchema.optional().default('feature'),
  sector: sectorSchema,
  priority: prioritySchema.optional().default('medium'),
  estimatePoints: z.number().int().positive().nullable().optional(),
  acceptanceCriteria: z.array(z.string()).optional().default([]),
  requiredSkills: z.array(z.string()).optional().default([]),
  operationKey: z.string().optional(),
  parentKey: z.string().optional(),
  status: z.enum(['backlog', 'ready']).optional().default('backlog'),
})

export const agentUpdateMissionSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    objective: z.string().max(2000).optional(),
    briefing: z.string().max(20000).optional(),
    type: missionTypeSchema.optional(),
    sector: sectorSchema.optional(),
    priority: prioritySchema.optional(),
    estimatePoints: z.number().int().positive().nullable().optional(),
    acceptanceCriteria: z.array(z.string()).optional(),
    requiredSkills: z.array(z.string()).optional(),
    orderIndex: z.number().int().optional(),
    operationKey: z.string().nullable().optional(),
  })
  .strict()

export const planOperationSchema = z.object({
  codename: z.string().min(1).max(120),
  objective: z.string().max(2000).optional().default(''),
  sectorsInScope: z.array(sectorSchema).optional().default([]),
  capacityPoints: z.number().int().positive().nullable().optional(),
  successCriteria: z.array(z.string()).optional().default([]),
  activate: z.boolean().optional().default(false),
})

// Scout / Interrogator write into The Archive (KnowledgeDocs) when onboarding a
// brownfield project. Docs are addressed by `path` (upserted per project) and nest
// via `parentPath`. Requires the `recon` scope.
export const agentWriteKnowledgeSchema = z.object({
  path: z.string().min(1).max(200),
  summary: z.string().max(2000),
  bodyMarkdown: z.string().max(50000).optional().default(''),
  level: z.number().int().min(0).max(10).optional().default(0),
  parentPath: z.string().max(200).optional(),
})

export const transitionSchema = z.object({
  to: missionStatusSchema,
  message: z.string().max(2000).optional(),
  outcome: z.string().max(2000).optional(),
  result: z.enum(['success', 'failed']).optional(),
})

// Route ids in this codebase are Postgres `uuid` columns. Feeding a malformed id
// straight into `eq(table.id, id)` makes Postgres throw 22P02 (string_to_uuid),
// which surfaces as an unhandled 500. Validate at the route boundary instead.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

// Reads a route param and asserts it is a well-formed UUID, throwing 400 otherwise.
// Use this anywhere a `:id` param flows into a uuid-typed DB lookup.
export function getUuidParam(event: import('h3').H3Event, name = 'id'): string {
  const value = getRouterParam(event, name)
  if (!isUuid(value)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${name}: expected a UUID` })
  }
  return value
}

// Reads + validates a JSON body against a schema, throwing a 422 on failure.
export async function parseBody<T extends z.ZodTypeAny>(
  event: import('h3').H3Event,
  schema: T,
): Promise<z.infer<T>> {
  const body = await readBody(event).catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten(),
    })
  }
  return parsed.data
}
