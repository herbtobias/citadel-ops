// GET /api/v1/projects/:id/missions — all missions in a project (access-gated).
import { assertProjectAccess } from '~~/server/utils/auth'
import { serializeProjectMissions } from '~~/server/utils/dto'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await assertProjectAccess(event, id)
  return serializeProjectMissions(id)
})
