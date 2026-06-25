// GET /api/v1/projects/:id/audit-verify — verify The Wire's hash chain (tamper-evidence, §24).
import { assertProjectAccess } from '~~/server/utils/auth'
import { verifyProjectChain } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')!
  await assertProjectAccess(event, projectId)
  return verifyProjectChain(projectId)
})
