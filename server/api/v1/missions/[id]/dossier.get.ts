// GET /api/v1/missions/:id/dossier — read a mission's dossier (user or agent).
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { resolveProjectActor } from '~~/server/utils/actor'

export default defineEventHandler(async (event) => {
  const missionId = getRouterParam(event, 'id')!
  const [mission] = await db.select().from(schema.missions).where(eq(schema.missions.id, missionId))
  if (!mission) throw createError({ statusCode: 404, statusMessage: 'Mission not found' })
  await resolveProjectActor(event, mission.projectId)

  if (!mission.dossierId) return null
  const [d] = await db.select().from(schema.dossiers).where(eq(schema.dossiers.id, mission.dossierId))
  if (!d) return null
  return {
    id: d.id, title: d.title, status: d.status, version: d.version,
    sections: d.sections, affectedFiles: d.affectedFiles, coldRead: d.coldRead,
  }
})
