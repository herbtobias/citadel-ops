// POST /api/v1/agent/missions/:id/hand-off — create a new mission in another sector
// and share full context (§6). The agent must own the source mission's claim.
// Sets a bidirectional reference (semantic + provenance) and parentId; enforces
// maxHandoffDepth (loop-guard, §21).
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { parseBody, sectorSchema, missionTypeSchema, prioritySchema } from '~~/server/utils/validation'
import { requireLicense, withIdempotency } from '~~/server/utils/license'
import { createBidirectional } from '~~/server/utils/references'
import { logActivity } from '~~/server/utils/activity'
import { serializeMissionById } from '~~/server/utils/dto'

const schema_ = z.object({
  sector: sectorSchema,
  type: missionTypeSchema,
  title: z.string().min(1).max(200),
  objective: z.string().max(2000).optional().default(''),
  briefing: z.string().max(20000).optional().default(''),
  priority: prioritySchema.optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
  // Semantic relation of the NEW mission to the source (e.g. a test mission "tests"
  // the source; a bugfix "fixes" it). Provenance (spawned_from/spawns) is always added.
  linkType: z.enum(['tests', 'fixes', 'blocks', 'relates_to', 'follow_up_of', 'duplicates']).default('relates_to'),
  note: z.string().max(2000).optional(),
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const lic = await requireLicense(event)
  const body = await parseBody(event, schema_)
  const idemKey = getHeader(event, 'idempotency-key') || undefined

  const [source] = await db.select().from(schema.missions).where(eq(schema.missions.id, id))
  if (!source) throw createError({ statusCode: 404, statusMessage: 'Source mission not found' })
  if (source.claimedByLicenseId !== lic.id) {
    throw createError({ statusCode: 403, statusMessage: 'Hand-off requires owning the source mission' })
  }

  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, source.projectId))
  const maxDepth = project?.settings?.maxHandoffDepth ?? 5
  const newDepth = source.handoffDepth + 1
  if (newDepth > maxDepth) {
    throw createError({ statusCode: 422, statusMessage: `Hand-off depth ${newDepth} exceeds max ${maxDepth}` })
  }

  // Pull source artifacts so they can be shared with the new mission.
  const srcArtifacts = await db.select().from(schema.artifacts).where(eq(schema.artifacts.missionId, id))

  const run = async () => {
    // Next project key.
    const existing = await db.select({ key: schema.missions.key }).from(schema.missions).where(eq(schema.missions.projectId, source.projectId))
    const maxNum = existing.reduce((m, r) => Math.max(m, Number.parseInt(r.key.split('-')[1] ?? '0', 10) || 0), 0)
    const key = `${project!.key}-${maxNum + 1}`

    const [created] = await db.insert(schema.missions).values({
      projectId: source.projectId,
      operationId: source.operationId,
      key,
      title: body.title,
      objective: body.objective,
      briefing: body.briefing,
      type: body.type,
      sector: body.sector,
      priority: body.priority ?? source.priority,
      status: 'ready', // immediately claimable by an agent in the target sector
      acceptanceCriteria: body.acceptanceCriteria ?? source.acceptanceCriteria,
      dossierId: source.dossierId, // share the source dossier (The Archive)
      parentId: source.id,
      handoffDepth: newDepth,
      createdByLicenseId: lic.id,
      sharedContext: {
        fromMissionKey: source.key,
        fromSector: source.sector,
        dossierId: source.dossierId,
        artifacts: srcArtifacts.map(a => ({ kind: a.kind, url: a.url, label: a.label })),
        acceptanceCriteria: source.acceptanceCriteria,
        note: body.note ?? null,
      },
    }).returning()

    // Semantic relation (new → source) + provenance (new spawned_from source).
    await createBidirectional({
      projectId: source.projectId, sourceId: created.id, targetId: source.id,
      linkType: body.linkType, note: body.note, createdByLicenseId: lic.id,
    })
    await createBidirectional({
      projectId: source.projectId, sourceId: created.id, targetId: source.id,
      linkType: 'spawned_from', createdByLicenseId: lic.id,
    })

    await logActivity({
      projectId: source.projectId, missionId: source.id, actorType: 'agent', actorLicenseId: lic.id,
      event: 'handed_off', message: `Handed off ${key} (${body.sector}/${body.type}) — ${body.linkType} ${source.key}`,
      metadata: { newMissionId: created.id, newKey: key },
    })
    await logActivity({
      projectId: source.projectId, missionId: created.id, actorType: 'agent', actorLicenseId: lic.id,
      event: 'created', toStatus: 'ready', message: `Spawned from ${source.key} via hand-off`,
    })

    const mission = await serializeMissionById(created.id)
    return { result: mission, resultRef: created.id }
  }

  setResponseStatus(event, 201)
  return withIdempotency(idemKey, 'hand-off', run)
})
