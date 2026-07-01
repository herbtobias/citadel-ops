// PATCH /api/v1/harness/:id — M edits a Harness Definition and/or flips its status
// active↔inactive (manager). §Q.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { getUuidParam, parseBody, updateHarnessSchema } from '~~/server/utils/validation'
import { assertQBranchManager, statusEvent } from '~~/server/utils/qbranch'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const id = getUuidParam(event)
  const [h] = await db.select().from(schema.harnessDefs).where(eq(schema.harnessDefs.id, id))
  if (!h) throw createError({ statusCode: 404, statusMessage: 'Harness not found' })
  const manager = await assertQBranchManager(event, h.projectId)
  const body = await parseBody(event, updateHarnessSchema)

  const [updated] = await db
    .update(schema.harnessDefs)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.commands !== undefined && { commands: body.commands }),
      ...(body.env !== undefined && { env: body.env }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.status !== undefined && { status: body.status }),
      updatedAt: new Date(),
    })
    .where(eq(schema.harnessDefs.id, id))
    .returning()
  if (!updated) throw createError({ statusCode: 500, statusMessage: 'Update failed' })

  const verb =
    body.status === 'active' ? 'Activated' : body.status === 'inactive' ? 'Deactivated' : 'Updated'
  await logActivity({
    projectId: h.projectId,
    actorType: 'human',
    actorUserId: manager.id,
    event: statusEvent('harness', body.status),
    message: `${verb} harness "${updated.name}" (${updated.key})`,
    metadata: { harnessId: id, key: updated.key },
  })

  return {
    id,
    key: updated.key,
    name: updated.name,
    commands: updated.commands,
    notes: updated.notes,
    status: updated.status,
  }
})
