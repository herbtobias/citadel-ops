// Citadel Ops — Dossier addendum helper (§PARLEY/SENTINEL X0). Appends a structured entry
// to a mission's dossier (sections.addenda) so it lands in the resuming mission's context —
// resume/certify happens over shared state, not a thread replay (fresh-context-friendly).
import { eq } from 'drizzle-orm'
import { db, schema } from '../db'
import type { DossierAddendum } from '../db/schema'

const { dossiers, missions } = schema

// Append an addendum to the mission's dossier, creating a minimal dossier if none exists yet
// (e.g. a non-design mission that still needs to ask a human). Returns the dossier id.
export async function appendDossierAddendum(
  missionId: string,
  addendum: Omit<DossierAddendum, 'at'>,
): Promise<string> {
  let [dossier] = await db.select().from(dossiers).where(eq(dossiers.missionId, missionId))

  if (!dossier) {
    const [mission] = await db.select().from(missions).where(eq(missions.id, missionId))
    if (!mission) throw createError({ statusCode: 404, statusMessage: 'Mission not found' })
    ;[dossier] = await db
      .insert(dossiers)
      .values({
        projectId: mission.projectId,
        missionId,
        title: `${mission.key} — dossier`,
        sections: {},
      })
      .returning()
  }
  if (!dossier) throw createError({ statusCode: 500, statusMessage: 'Dossier upsert failed' })

  const sections = { ...(dossier.sections ?? {}) }
  const entry: DossierAddendum = { ...addendum, at: new Date().toISOString() }
  sections.addenda = [...(sections.addenda ?? []), entry]

  await db
    .update(dossiers)
    .set({ sections, version: dossier.version + 1, updatedAt: new Date() })
    .where(eq(dossiers.id, dossier.id))
  return dossier.id
}
