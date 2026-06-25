// GET /api/v1/projects — projects the signed-in user can access (§15).
import { listAccessibleProjects, requireUser } from '~~/server/utils/auth'
import { serializeProject } from '~~/server/utils/dto'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const rows = await listAccessibleProjects(user)
  return rows.map(serializeProject)
})
