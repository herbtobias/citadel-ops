// GET /api/v1/projects/:id — single project (access-gated).
import { assertProjectAccess } from '~~/server/utils/auth'
import { serializeProject } from '~~/server/utils/dto'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { project } = await assertProjectAccess(event, id)
  return serializeProject(project)
})
