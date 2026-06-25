// POST /api/v1/agent/check-in — license check-in / heartbeat (Moneypenny → M Desk).
// Returns the agent's operating context. §10 step 1.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { requireLicense } from '~~/server/utils/license'
import { logActivity } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const lic = await requireLicense(event)
  const [project] = lic.projectId
    ? await db.select().from(schema.projects).where(eq(schema.projects.id, lic.projectId))
    : []

  await logActivity({
    projectId: lic.projectId, actorType: 'agent', actorLicenseId: lic.id,
    event: 'checked_in', message: `${lic.agentAlias} checked in`,
  })

  return {
    agentAlias: lic.agentAlias,
    sectors: lic.sectors,
    status: lic.status,
    project: project ? { id: project.id, key: project.key, name: project.name } : null,
  }
})
