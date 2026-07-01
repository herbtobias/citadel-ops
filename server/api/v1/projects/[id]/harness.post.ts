// POST /api/v1/projects/:id/harness — M authors a Harness Definition (manager). Created
// `active`. §Q.
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { getUuidParam, parseBody, harnessSchema } from '~~/server/utils/validation'
import { assertQBranchManager } from '~~/server/utils/qbranch'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const projectId = getUuidParam(event)
  const manager = await assertQBranchManager(event, projectId)
  const body = await parseBody(event, harnessSchema)

  const [existing] = await db
    .select({ id: schema.harnessDefs.id })
    .from(schema.harnessDefs)
    .where(and(eq(schema.harnessDefs.projectId, projectId), eq(schema.harnessDefs.key, body.key)))
  if (existing)
    throw createError({
      statusCode: 409,
      statusMessage: `A harness with key "${body.key}" already exists`,
    })

  const [h] = await db
    .insert(schema.harnessDefs)
    .values({
      projectId,
      key: body.key,
      name: body.name,
      commands: body.commands,
      env: body.env,
      notes: body.notes,
      status: 'active',
    })
    .returning()
  if (!h) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

  await logActivity({
    projectId,
    actorType: 'human',
    actorUserId: manager.id,
    event: 'harness_created',
    message: `Created harness "${h.name}" (${h.key})`,
    metadata: { harnessId: h.id, key: h.key },
  })

  setResponseStatus(event, 201)
  return {
    id: h.id,
    key: h.key,
    name: h.name,
    commands: h.commands,
    notes: h.notes,
    status: h.status,
  }
})
