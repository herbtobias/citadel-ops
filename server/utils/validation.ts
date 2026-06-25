// Citadel Ops — shared Zod schemas (REST today, MCP later). §12/§16.
import { z } from 'zod'

export const sectorSchema = z.enum(['FRONTEND', 'BACKEND', 'QA', 'INFRA', 'SECURITY', 'DESIGN'])
export const missionTypeSchema = z.enum(['design', 'feature', 'test', 'bugfix', 'spike', 'chore', 'research'])
export const missionStatusSchema = z.enum([
  'backlog', 'designing', 'cold_read', 'ready', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled',
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

export const updateMissionSchema = z.object({
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
}).strict()

export const transitionSchema = z.object({
  to: missionStatusSchema,
  message: z.string().max(2000).optional(),
  outcome: z.string().max(2000).optional(),
  result: z.enum(['success', 'failed']).optional(),
})

// Reads + validates a JSON body against a schema, throwing a 422 on failure.
export async function parseBody<T extends z.ZodTypeAny>(event: import('h3').H3Event, schema: T): Promise<z.infer<T>> {
  const body = await readBody(event).catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: parsed.error.flatten() })
  }
  return parsed.data
}
