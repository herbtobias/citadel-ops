// Citadel Ops — typed cross-references between missions/operations (§6/§8).
// References are stored directionally; we create both directions so the graph
// reads correctly from either node.
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db'

const { references } = schema

export type LinkType = (typeof schema.linkType.enumValues)[number]
export type RefKind = 'mission' | 'operation'

// Inverse of each link type (for the reciprocal edge). Symmetric types map to themselves.
export const INVERSE_LINK: Record<LinkType, LinkType> = {
  spawned_from: 'spawns',
  spawns: 'spawned_from',
  tests: 'tested_by',
  tested_by: 'tests',
  fixes: 'fixed_by',
  fixed_by: 'fixes',
  blocks: 'blocked_by',
  blocked_by: 'blocks',
  relates_to: 'relates_to',
  duplicates: 'duplicates',
  part_of: 'part_of',
  follow_up_of: 'follow_up_of',
}

type RefInput = {
  projectId: string
  sourceKind?: RefKind
  sourceId: string
  targetKind?: RefKind
  targetId: string
  linkType: LinkType
  note?: string | null
  createdByLicenseId?: string | null
}

// Inserts one directional reference, skipping exact duplicates.
export async function createReference(input: RefInput) {
  const sourceKind = input.sourceKind ?? 'mission'
  const targetKind = input.targetKind ?? 'mission'
  const [dup] = await db.select().from(references).where(and(
    eq(references.sourceKind, sourceKind),
    eq(references.sourceId, input.sourceId),
    eq(references.targetKind, targetKind),
    eq(references.targetId, input.targetId),
    eq(references.linkType, input.linkType),
  ))
  if (dup) return dup
  const [row] = await db.insert(references).values({
    projectId: input.projectId,
    sourceKind, sourceId: input.sourceId,
    targetKind, targetId: input.targetId,
    linkType: input.linkType,
    note: input.note ?? null,
    createdByLicenseId: input.createdByLicenseId ?? null,
  }).returning()
  return row
}

// Inserts a reference and its inverse (bidirectional link).
export async function createBidirectional(input: RefInput) {
  const forward = await createReference(input)
  await createReference({
    ...input,
    sourceKind: input.targetKind ?? 'mission',
    sourceId: input.targetId,
    targetKind: input.sourceKind ?? 'mission',
    targetId: input.sourceId,
    linkType: INVERSE_LINK[input.linkType],
  })
  return forward
}
