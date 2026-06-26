// GET /api/v1/projects/:id/missions — all missions in a project (access-gated).
import { assertProjectAccess } from '~~/server/utils/auth'
import { serializeProjectMissions } from '~~/server/utils/dto'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const id = getUuidParam(event)
  await assertProjectAccess(event, id)
  return serializeProjectMissions(id)
})
