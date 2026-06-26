// DELETE /api/v1/organizations/:id?confirm=<slug> — purge an entire organization
// (tenant) and ALL its data via the DB cascade: every project and its children,
// memberships, invitations, licenses, themes. SuperAdmin only — this is the GDPR
// right-to-be-forgotten / tenant-offboarding path. Irreversible: requires
// ?confirm=<org slug>. Platform users are global and are NOT deleted (only their
// memberships in this org). §26.
import { eq } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { isSuperAdmin, requireUser } from '~~/server/utils/auth'
import { getUuidParam } from '~~/server/utils/validation'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (!isSuperAdmin(user)) throw createError({ statusCode: 403, statusMessage: 'SuperAdmin only' })

  const orgId = getUuidParam(event)
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
  if (!org) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })

  const confirm = getQuery(event).confirm as string | undefined
  if (confirm !== org.slug)
    throw createError({
      statusCode: 422,
      statusMessage: `Irreversible. Pass ?confirm=${org.slug} to purge this organization.`,
    })

  const projects = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.orgId, orgId))

  // The cascade (onDelete: 'cascade' on every org FK) removes projects + all children,
  // memberships, invitations, licenses and themes. Global users survive.
  await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId))

  return { ok: true, purged: { organization: org.slug, projects: projects.length } }
})
