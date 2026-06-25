// POST /api/v1/errors — record a frontend/runner error (Echelon, §25). Carries the
// traceId so it joins the same timeline as API errors and The Wire.
import { z } from 'zod'
import { db, schema } from '~~/server/db'
import { parseBody } from '~~/server/utils/validation'

const schema_ = z.object({
  source: z.enum(['frontend', 'runner', 'mcp']).default('frontend'),
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  projectId: z.string().uuid().optional(),
  missionId: z.string().uuid().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
})

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, schema_)
  await db.insert(schema.errorEvents).values({
    traceId: event.context.traceId ?? null,
    projectId: body.projectId ?? null,
    missionId: body.missionId ?? null,
    level: 'error',
    source: body.source,
    message: body.message,
    stack: body.stack ?? null,
    context: body.context ?? null,
  })
  setResponseStatus(event, 201)
  return { ok: true, traceId: event.context.traceId ?? null }
})
