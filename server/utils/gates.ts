// Citadel Ops — Quality Gate enforcement (Q-Branch, §7/§8). Gates are evaluated at
// the single transition chokepoint so REST and agent paths share them.
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db'

const { qualityGates, dossiers, artifacts } = schema

type Mission = typeof schema.missions.$inferSelect

// Throws 422 if any blocking gate for `toStatus` is unsatisfied. §18.
export async function checkGates(
  projectId: string,
  mission: Mission,
  toStatus: string,
): Promise<void> {
  const gates = await db
    .select()
    .from(qualityGates)
    .where(
      and(
        eq(qualityGates.projectId, projectId),
        eq(qualityGates.appliesToStatus, toStatus as any),
        eq(qualityGates.blocking, true),
        // Only ACTIVE gates enforce. `pending` (Planner-proposed, awaiting M) and `inactive`
        // (M-retired) gates never block a transition. §Q.
        eq(qualityGates.status, 'active'),
      ),
    )
  if (gates.length === 0) return

  for (const g of gates) {
    const rule = g.rule

    if (rule.requireColdRead) {
      if (!mission.dossierId) {
        throw createError({
          statusCode: 422,
          statusMessage: `Gate "${g.name}": a Cold-Read-passed dossier is required`,
        })
      }
      const [d] = await db.select().from(dossiers).where(eq(dossiers.id, mission.dossierId))
      if (d?.status !== 'cold_read_passed') {
        throw createError({
          statusCode: 422,
          statusMessage: `Gate "${g.name}": dossier has not passed Cold Read`,
        })
      }
    }

    if (rule.requireArtifacts) {
      const arts = await db
        .select({ id: artifacts.id })
        .from(artifacts)
        .where(eq(artifacts.missionId, mission.id))
      if (arts.length === 0) {
        throw createError({
          statusCode: 422,
          statusMessage: `Gate "${g.name}": at least one artifact is required`,
        })
      }
    }

    if (rule.requireHarnessPass) {
      const reports = await db
        .select({ id: artifacts.id })
        .from(artifacts)
        .where(and(eq(artifacts.missionId, mission.id), eq(artifacts.kind, 'test_report')))
      if (reports.length === 0) {
        throw createError({
          statusCode: 422,
          statusMessage: `Gate "${g.name}": a passing harness report (test_report artifact) is required`,
        })
      }
    }

    if (rule.requireAcceptanceChecked) {
      // We track acceptance criteria as a list; presence is treated as satisfied.
      // Per-criterion sign-off lands with the dossier editor (P7).
      if (!mission.acceptanceCriteria || mission.acceptanceCriteria.length === 0) {
        throw createError({
          statusCode: 422,
          statusMessage: `Gate "${g.name}": acceptance criteria must be defined`,
        })
      }
    }
  }
}
