// Citadel Ops — The Wire. Append-only, hash-chained activity log (§8/§24).
// Each entry's hash chains the previous entry's hash → tamper-evident.
import { createHash } from 'node:crypto'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { db, schema } from '../db'
import { publishEvent } from './events'
import { getTraceId } from './tracing'

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
//
// The read-prevHash → insert window MUST be serialized per project, or two concurrent
// appends chain off the same prevHash and fork the hash chain (breaking verifyProjectChain).
// This races even on a single instance — postgres.js runs a pool of connections. So we take
// a per-project transaction-scoped advisory lock (auto-released at COMMIT) and do the read
// + insert in one transaction, ordering the chain tail by the monotonic `seq`. §HORIZON M3.
export async function logActivity(input: LogInput) {
  const traceId = input.traceId ?? getTraceId()

  const row = await db.transaction(async (tx) => {
    if (input.projectId) {
      // Lock domain = the project. hashtext() maps the uuid string to the bigint the
      // advisory-lock API needs; different projects never contend.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.projectId}))`)
    }

    const [prev] = input.projectId
      ? await tx
          .select({ hash: activityLog.hash })
          .from(activityLog)
          .where(eq(activityLog.projectId, input.projectId))
          .orderBy(desc(activityLog.seq))
          .limit(1)
      : []

    const prevHash = prev?.hash ?? null
    const hash = computeHash(prevHash, input)

    const [inserted] = await tx
      .insert(activityLog)
      .values({ ...input, traceId, prevHash, hash })
      .returning()
    return inserted
  })

  // Fan out to the live event bus (SSE/webhooks) after the append is durably committed.
  publishEvent({
    projectId: input.projectId ?? null,
    type: input.event,
    missionId: input.missionId ?? null,
    message: input.message ?? null,
    traceId,
  })
  return row
}

// Tamper-evidence: walk the project's chain in order, recompute each hash and check
// linkage. Returns the first broken entry if any. §24.
export async function verifyProjectChain(projectId: string) {
  const rows = await db
    .select()
    .from(activityLog)
    .where(eq(activityLog.projectId, projectId))
    .orderBy(asc(activityLog.seq))

  let prevHash: string | null = null
  for (const r of rows) {
    const expected = computeHash(prevHash, {
      projectId: r.projectId,
      missionId: r.missionId,
      event: r.event,
      fromStatus: r.fromStatus,
      toStatus: r.toStatus,
      message: r.message,
      actorType: r.actorType,
      actorLicenseId: r.actorLicenseId,
      actorUserId: r.actorUserId,
    })
    if (r.prevHash !== prevHash || r.hash !== expected) {
      return {
        intact: false,
        entries: rows.length,
        brokenAt: { id: r.id, event: r.event, createdAt: r.createdAt },
      }
    }
    prevHash = r.hash
  }
  return { intact: true, entries: rows.length }
}
