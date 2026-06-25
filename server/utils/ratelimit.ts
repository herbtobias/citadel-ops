// Citadel Ops — per-License rate limiting (§21). In-memory fixed-window; Redis
// backplane replaces this at multi-instance scale (§24, deferred).
import { eq } from 'drizzle-orm'
import { db, schema } from '../db'

const windows = new Map<string, { count: number, resetAt: number }>()

// Project rate limit cache (avoids a settings query on every agent call).
const limitCache = new Map<string, { limit: number, ts: number }>()
const CACHE_TTL = 30_000
const DEFAULT_LIMIT = Number.parseInt(process.env.CITADEL_RATE_LIMIT || '300', 10)

export async function getProjectRateLimit(projectId: string | null): Promise<number> {
  if (!projectId) return DEFAULT_LIMIT
  const cached = limitCache.get(projectId)
  // Date.now is fine in the server runtime (not a workflow script).
  const now = Date.now()
  if (cached && now - cached.ts < CACHE_TTL) return cached.limit
  const [p] = await db.select({ settings: schema.projects.settings }).from(schema.projects).where(eq(schema.projects.id, projectId))
  const limit = p?.settings?.rateLimits?.callsPerMin ?? DEFAULT_LIMIT
  limitCache.set(projectId, { limit, ts: now })
  return limit
}

export function enforceRateLimit(key: string, limitPerMin: number): void {
  const now = Date.now()
  let w = windows.get(key)
  if (!w || now >= w.resetAt) {
    w = { count: 0, resetAt: now + 60_000 }
    windows.set(key, w)
  }
  w.count++
  if (w.count > limitPerMin) {
    throw createError({ statusCode: 429, statusMessage: `Rate limit exceeded (${limitPerMin}/min)` })
  }
}
