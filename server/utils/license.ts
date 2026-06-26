// Citadel Ops — License auth (The M Desk) + claim/lease helpers (DSPTCH, §9/§21).
// Agents authenticate with `Authorization: Bearer lic_…`. Keys are stored as a
// deterministic SHA-256 hash so a bearer token can be looked up directly.
import type { H3Event } from 'h3'
import { createHash, randomBytes } from 'node:crypto'
import { and, eq, lt } from 'drizzle-orm'
import { db, schema } from '../db'
import { enforceRateLimit, getProjectRateLimit } from './ratelimit'

const { licenses, missions } = schema

export const LEASE_MS = 15 * 60 * 1000 // 15 minutes

export function generateLicenseKey(): string {
  return `lic_${randomBytes(24).toString('hex')}`
}

export function hashLicenseKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export function getBearerToken(event: H3Event): string | null {
  const h = getHeader(event, 'authorization')
  if (!h || !h.startsWith('Bearer ')) return null
  return h.slice(7).trim() || null
}

export type License = typeof licenses.$inferSelect

// Authenticates an agent by its license key. Enforces the kill-switch (revoked →
// 401), expiry, and updates lastSeenAt (heartbeat). §9.
export async function requireLicense(event: H3Event): Promise<License> {
  const token = getBearerToken(event)
  if (!token)
    throw createError({ statusCode: 401, statusMessage: 'Missing license (Bearer token)' })

  const [lic] = await db
    .select()
    .from(licenses)
    .where(eq(licenses.hashedKey, hashLicenseKey(token)))
  if (!lic) throw createError({ statusCode: 401, statusMessage: 'Invalid license' })

  if (lic.status === 'revoked')
    throw createError({ statusCode: 401, statusMessage: 'license_revoked' })
  if (lic.status === 'expired')
    throw createError({ statusCode: 401, statusMessage: 'license_expired' })
  if (lic.expiresAt && lic.expiresAt < new Date()) {
    await db.update(licenses).set({ status: 'expired' }).where(eq(licenses.id, lic.id))
    throw createError({ statusCode: 401, statusMessage: 'license_expired' })
  }

  // Per-license rate limit (§21).
  enforceRateLimit(lic.id, await getProjectRateLimit(lic.projectId))

  await db.update(licenses).set({ lastSeenAt: new Date() }).where(eq(licenses.id, lic.id))
  return lic
}

export function licenseHasSector(lic: License, sector: string): boolean {
  return (lic.sectors as string[]).includes(sector)
}

// Capability scopes a License may hold (orthogonal to sectors, which are work-lanes).
// `plan` lets an agent act as a Planner: create/groom Operations & Missions upstream
// of execution. Default licenses have no scopes (execution-only).
export const PLAN_SCOPE = 'plan'

export function licenseHasScope(lic: License, scope: string): boolean {
  return (lic.scopes as string[]).includes(scope)
}

// Guard for the planning endpoints — 403s an agent whose License lacks `plan`.
export function assertPlanScope(lic: License): void {
  if (!licenseHasScope(lic, PLAN_SCOPE)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'License lacks the `plan` scope (Planner capability required)',
    })
  }
}

// Watchdog: re-queue missions whose lease expired (crashed/stuck agents). Returns
// the count re-queued. Called opportunistically before each claim. §21.
export async function sweepExpiredLeases(projectId: string): Promise<number> {
  const expired = await db
    .select()
    .from(missions)
    .where(
      and(
        eq(missions.projectId, projectId),
        eq(missions.status, 'in_progress'),
        lt(missions.leaseExpiresAt, new Date()),
      ),
    )
  for (const m of expired) {
    await db
      .update(missions)
      .set({
        status: 'ready',
        claimedByLicenseId: null,
        claimedAt: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      })
      .where(eq(missions.id, m.id))
    await logActivity({
      projectId,
      missionId: m.id,
      actorType: 'system',
      event: 'lease_expired',
      fromStatus: 'in_progress',
      toStatus: 'ready',
      message: `Lease expired; re-queued ${m.key}`,
    })
  }
  return expired.length
}

// Exactly-once guard for writing agent calls (§21). If the key was already used in
// this scope, returns the cached result ref; otherwise runs fn and records the key.
export async function withIdempotency<T>(
  key: string | undefined,
  scope: string,
  fn: () => Promise<{ result: T; resultRef?: string }>,
): Promise<T> {
  if (!key) return (await fn()).result

  const [existing] = await db
    .select()
    .from(schema.idempotencyKeys)
    .where(and(eq(schema.idempotencyKeys.key, key), eq(schema.idempotencyKeys.scope, scope)))
  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Duplicate request (idempotency key already used)',
      data: { resultRef: existing.resultRef },
    })
  }

  const { result, resultRef } = await fn()
  await db.insert(schema.idempotencyKeys).values({ key, scope, resultRef: resultRef ?? null })
  return result
}
