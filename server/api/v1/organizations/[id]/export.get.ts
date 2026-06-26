// GET /api/v1/organizations/:id/export — GDPR data export (§26). Full tenant dump
// (no secrets/keys). Manager or SuperAdmin.
import { eq, inArray } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { assertOrgManager } from '~~/server/utils/auth'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const orgId = getUuidParam(event)
  await assertOrgManager(event, orgId)

  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
  if (!org) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })

  const memberships = await db
    .select()
    .from(schema.orgMemberships)
    .where(eq(schema.orgMemberships.orgId, orgId))
  const users = memberships.length
    ? await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          name: schema.users.name,
          systemRole: schema.users.systemRole,
        })
        .from(schema.users)
        .where(
          inArray(
            schema.users.id,
            memberships.map((m) => m.userId),
          ),
        )
    : []
  const projects = await db.select().from(schema.projects).where(eq(schema.projects.orgId, orgId))
  const projectIds = projects.map((p) => p.id)

  const sel = <T>(rows: T): T => rows
  const operations = projectIds.length
    ? await db
        .select()
        .from(schema.operations)
        .where(inArray(schema.operations.projectId, projectIds))
    : []
  const missions = projectIds.length
    ? await db.select().from(schema.missions).where(inArray(schema.missions.projectId, projectIds))
    : []
  const dossiers = projectIds.length
    ? await db.select().from(schema.dossiers).where(inArray(schema.dossiers.projectId, projectIds))
    : []
  const references = projectIds.length
    ? await db
        .select()
        .from(schema.references)
        .where(inArray(schema.references.projectId, projectIds))
    : []
  const activity = projectIds.length
    ? await db
        .select()
        .from(schema.activityLog)
        .where(inArray(schema.activityLog.projectId, projectIds))
    : []
  const licenses = projectIds.length
    ? (
        await db
          .select()
          .from(schema.licenses)
          .where(inArray(schema.licenses.projectId, projectIds))
      ).map(({ hashedKey, ...rest }) => rest) // never export key material
    : []

  setHeader(event, 'content-disposition', `attachment; filename="citadel-export-${org.slug}.json"`)
  return sel({
    exportedAt: new Date().toISOString(),
    organization: org,
    members: memberships.map((m) => ({ ...m, user: users.find((u) => u.id === m.userId) })),
    projects,
    operations,
    missions,
    dossiers,
    references,
    licenses,
    activity,
  })
})
