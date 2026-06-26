// Citadel Ops — dual-auth resolver. Q-Branch / Briefing endpoints serve both HQ
// users (session) and Field-Agents (license). Agents are scoped to their license's
// project; users go through the normal project-access check.
import type { H3Event } from 'h3'
import { assertProjectAccess, type SessionUser } from './auth'
import { getBearerToken, requireLicense, type License } from './license'

export type ProjectActor =
  | { kind: 'agent'; license: License; user?: undefined }
  | { kind: 'user'; user: SessionUser; license?: undefined }

// Resolves either an agent (Bearer license) or a signed-in user, and asserts the
// actor may access the given project.
export async function resolveProjectActor(
  event: H3Event,
  projectId: string,
): Promise<ProjectActor> {
  if (getBearerToken(event)) {
    const license = await requireLicense(event)
    if (license.projectId && license.projectId !== projectId) {
      throw createError({
        statusCode: 403,
        statusMessage: 'License is scoped to a different project',
      })
    }
    return { kind: 'agent', license }
  }
  const { user } = await assertProjectAccess(event, projectId)
  return { kind: 'user', user }
}
