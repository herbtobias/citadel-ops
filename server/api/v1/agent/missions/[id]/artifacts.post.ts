// POST /api/v1/agent/missions/:id/artifacts — attach an artifact (PR, commit,
// test_report, …) to a claimed mission. test_report satisfies requireHarnessPass.
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { parseBody } from '~~/server/utils/validation'
import { requireLicense } from '~~/server/utils/license'
import { logActivity } from '~~/server/utils/activity'

const schema_ = z.object({
  kind: z.enum(['pr', 'commit', 'file', 'url', 'test_report']),
  url: z.string().min(1),
  label: z.string().min(1).max(200),
})

export default defineEventHandler(async (event) => {
  const missionId = getRouterParam(event, 'id')!
  const lic = await requireLicense(event)
  const body = await parseBody(event, schema_)

  const [m] = await db.select().from(schema.missions).where(eq(schema.missions.id, missionId))
  if (!m) throw createError({ statusCode: 404, statusMessage: 'Mission not found' })
  if (m.claimedByLicenseId !== lic.id)
    throw createError({ statusCode: 403, statusMessage: 'Mission not claimed by this license' })

  const [a] = await db
    .insert(schema.artifacts)
    .values({
      missionId,
      kind: body.kind,
      url: body.url,
      label: body.label,
      createdByLicenseId: lic.id,
    })
    .returning()
  if (!a) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

  await logActivity({
    projectId: m.projectId,
    missionId,
    actorType: 'agent',
    actorLicenseId: lic.id,
    event: 'artifact_attached',
    message: `Attached ${body.kind}: ${body.label}`,
  })

  setResponseStatus(event, 201)
  return { id: a.id, kind: a.kind, label: a.label }
})
