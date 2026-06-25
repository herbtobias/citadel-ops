// Citadel Ops — The Wire. Append-only, hash-chained activity log (§8/§24).
// Each entry's hash chains the previous entry's hash → tamper-evident.
import { createHash } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '../db'
import { publishEvent } from './events'

const { activityLog } = schema

type LogInput = {
  projectId?: string | null
  missionId?: string | null
  operationId?: string | null
  actorType: 'agent' | 'human' | 'system'
  actorLicenseId?: string | null
  actorUserId?: string | null
  event: string
  fromStatus?: string | null
  toStatus?: string | null
  message?: string | null
  durationSec?: number | null
  metadata?: Record<string, unknown> | null
  traceId?: string | null
}

function computeHash(prevHash: string | null, entry: LogInput): string {
  const payload = JSON.stringify({
    prevHash: prevHash ?? '',
    projectId: entry.projectId ?? '',
    missionId: entry.missionId ?? '',
    event: entry.event,
    fromStatus: entry.fromStatus ?? '',
    toStatus: entry.toStatus ?? '',
    message: entry.message ?? '',
    actor: entry.actorLicenseId ?? entry.actorUserId ?? 'system',
  })
  return createHash('sha256').update(payload).digest('hex')
}

// Appends one entry to The Wire, chaining off the most recent project entry.
export async function logActivity(input: LogInput) {
  const [prev] = input.projectId
    ? await db.select({ hash: activityLog.hash }).from(activityLog)
        .where(eq(activityLog.projectId, input.projectId))
        .orderBy(desc(activityLog.createdAt)).limit(1)
    : []

  const prevHash = prev?.hash ?? null
  const hash = computeHash(prevHash, input)

  const [row] = await db.insert(activityLog).values({
    ...input,
    prevHash,
    hash,
  }).returning()

  // Fan out to the live event bus (SSE/webhooks).
  publishEvent({
    projectId: input.projectId ?? null,
    type: input.event,
    missionId: input.missionId ?? null,
    message: input.message ?? null,
    traceId: input.traceId ?? null,
  })
  return row
}
