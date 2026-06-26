// GET /api/v1/projects/:id — single project (access-gated).
import { assertProjectAccess } from '~~/server/utils/auth'
import { serializeProject } from '~~/server/utils/dto'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const id = getUuidParam(event)
  const { project } = await assertProjectAccess(event, id)
  return serializeProject(project)
})
