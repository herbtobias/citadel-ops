// POST /api/v1/projects/:id/licenses — issue an agent license (The M Desk, manager).
// The raw key is returned ONCE; only its hash is stored.
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { getUuidParam, parseBody, sectorSchema } from '~~/server/utils/validation'
import { assertOrgManager } from '~~/server/utils/auth'
import { generateLicenseKey, hashLicenseKey } from '~~/server/utils/license'
import { logActivity } from '~~/server/utils/activity'

const schema_ = z.object({
  agentAlias: z.string().min(1).max(40),
  sectors: z.array(sectorSchema).min(1),
  // Capability scopes: `plan` (Planner — groom Operations/Missions), `recon`
  // (Scout/Interrogator — write The Archive when onboarding a brownfield project).
  scopes: z
    .array(z.enum(['plan', 'recon']))
    .optional()
    .default([]),
  // `standing` = a classic agent key; `provisioning` = a key that only mints short-lived
  // session licenses via the acquire handshake (its sectors/scopes are the ceiling). §C.
  kind: z.enum(['standing', 'provisioning']).optional().default('standing'),
  expiresInDays: z.number().int().positive().max(365).optional(),
})

export default defineEventHandler(async (event) => {
  const projectId = getUuidParam(event)
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  const manager = await assertOrgManager(event, project.orgId)

  const { agentAlias, sectors, scopes, kind, expiresInDays } = await parseBody(event, schema_)

  // A provisioning key is per (project, owner): one M = one active key on a project. If
  // this manager already holds one here, rotate it (POST …/rotate) instead of issuing a
  // second, or revoke it first. Keeps `acquire` attribution unambiguous across multiple Ms.
  if (kind === 'provisioning') {
    const [existing] = await db
      .select({ id: schema.licenses.id })
      .from(schema.licenses)
      .where(
        and(
          eq(schema.licenses.projectId, projectId),
          eq(schema.licenses.ownerUserId, manager.id),
          eq(schema.licenses.kind, 'provisioning'),
          eq(schema.licenses.status, 'active'),
        ),
      )
    if (existing)
      throw createError({
        statusCode: 409,
        statusMessage:
          'You already have an active provisioning key on this project — rotate it (refresh the secret, sessions survive) or revoke it first.',
      })
  }

  const key = generateLicenseKey()
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400_000) : null

  const [lic] = await db
    .insert(schema.licenses)
    .values({
      orgId: project.orgId,
      projectId,
      agentAlias,
      hashedKey: hashLicenseKey(key),
      sectors,
      scopes,
      kind,
      ownerUserId: manager.id,
      status: 'active',
      expiresAt,
    })
    .returning()
  if (!lic) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

  const scopeNote = scopes.length ? ` +${scopes.join(',')}` : ''
  const kindNote = kind === 'provisioning' ? ' (provisioning key)' : ''
  await logActivity({
    projectId,
    actorType: 'human',
    actorUserId: manager.id,
    event: 'license_issued',
    message: `Issued ${kind} license to ${agentAlias} [${sectors.join(', ')}]${scopeNote}${kindNote}`,
    metadata: { licenseId: lic.id, kind },
  })

  setResponseStatus(event, 201)
  // key is shown only here — never retrievable again.
  return {
    id: lic.id,
    agentAlias: lic.agentAlias,
    sectors: lic.sectors,
    scopes: lic.scopes,
    kind: lic.kind,
    expiresAt: lic.expiresAt,
    key,
  }
})
