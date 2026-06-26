// POST /api/v1/agent/links — Planner: link two missions by key (link_missions, §12).
// Requires the `plan` scope. Creates a bidirectional typed reference within the
// License's project.
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { parseBody } from '~~/server/utils/validation'
import { requireLicense, assertPlanScope } from '~~/server/utils/license'
import { createBidirectional } from '~~/server/utils/references'
import { logActivity } from '~~/server/utils/activity'

const schema_ = z.object({
  sourceKey: z.string().min(1),
  targetKey: z.string().min(1),
  linkType: z.enum(schema.linkType.enumValues),
})

export default defineEventHandler(async (event) => {
  const lic = await requireLicense(event)
  assertPlanScope(lic)
  if (!lic.projectId)
    throw createError({ statusCode: 422, statusMessage: 'License is not bound to a project' })
  const projectId = lic.projectId
  const { sourceKey, targetKey, linkType } = await parseBody(event, schema_)

  if (sourceKey === targetKey)
    throw createError({ statusCode: 422, statusMessage: 'Cannot link a mission to itself' })

  const findMission = async (key: string) => {
    const [m] = await db
      .select()
      .from(schema.missions)
      .where(and(eq(schema.missions.projectId, projectId), eq(schema.missions.key, key)))
    return m
  }
  const source = await findMission(sourceKey)
  const target = await findMission(targetKey)
  if (!source)
    throw createError({ statusCode: 404, statusMessage: `Mission ${sourceKey} not found` })
  if (!target)
    throw createError({ statusCode: 404, statusMessage: `Mission ${targetKey} not found` })

  await createBidirectional({
    projectId,
    sourceId: source.id,
    targetId: target.id,
    linkType,
    createdByLicenseId: lic.id,
  })

  await logActivity({
    projectId,
    missionId: source.id,
    actorType: 'agent',
    actorLicenseId: lic.id,
    event: 'linked',
    message: `${sourceKey} ${linkType} ${targetKey}`,
    metadata: { targetMissionId: target.id, linkType },
  })

  setResponseStatus(event, 201)
  return { ok: true, sourceKey, targetKey, linkType }
})
