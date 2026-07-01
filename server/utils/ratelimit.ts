// Citadel Ops — per-License rate limiting + login throttle (§21/§22). Fixed-window. With a
// Redis backplane (§HORIZON M4) the counters are shared, so the limit is correct in aggregate
// across instances (in-memory would be N× too generous / the login throttle N× weaker). Without
// REDIS_URL it falls back to in-memory (single-instance dev). The functions are async because
// Redis is; callers await them.
import { eq } from 'drizzle-orm'
import { db, schema } from '../db'
import { redisEnabled, getRedis } from './redis'

const windows = new Map<string, { count: number; resetAt: number }>()

// Project rate limit cache (avoids a settings query on every agent call).
const limitCache = new Map<string, { limit: number; ts: number }>()
const CACHE_TTL = 30_000
const DEFAULT_LIMIT = Number.parseInt(process.env.CITADEL_RATE_LIMIT || '300', 10)

export async function getProjectRateLimit(projectId: string | null): Promise<number> {
  if (!projectId) return DEFAULT_LIMIT
  const cached = limitCache.get(projectId)
  // Date.now is fine in the server runtime (not a workflow script).
  const now = Date.now()
  if (cached && now - cached.ts < CACHE_TTL) return cached.limit
  const [p] = await db
    .select({ settings: schema.projects.settings })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
  const limit = p?.settings?.rateLimits?.callsPerMin ?? DEFAULT_LIMIT
  limitCache.set(projectId, { limit, ts: now })
  return limit
}

export async function enforceRateLimit(key: string, limitPerMin: number): Promise<void> {
  const tooMany = () =>
    createError({ statusCode: 429, statusMessage: `Rate limit exceeded (${limitPerMin}/min)` })

  if (redisEnabled()) {
    const minute = Math.floor(Date.now() / 60_000)
    const rk = `rl:${key}:${minute}`
    const r = getRedis()
    const count = await r.incr(rk)
    if (count === 1) await r.expire(rk, 120)
    if (count > limitPerMin) throw tooMany()
    return
  }

  const now = Date.now()
  let w = windows.get(key)
  if (!w || now >= w.resetAt) {
    w = { count: 0, resetAt: now + 60_000 }
    windows.set(key, w)
  }
  w.count++
  if (w.count > limitPerMin) throw tooMany()
}

// Failed-login throttle (§22). Counts failures per key (ip+email); too many within
// the window → 429 until it lapses. Cleared on a successful login. In-memory like the
// rate limiter above (Redis at multi-instance scale, deferred).
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const LOGIN_MAX = Number.parseInt(process.env.LOGIN_MAX_ATTEMPTS || '10', 10)
const LOGIN_WINDOW_MS = 15 * 60_000

export async function assertLoginAllowed(key: string): Promise<void> {
  const blocked = () =>
    createError({
      statusCode: 429,
      statusMessage: 'Too many failed login attempts. Try again later.',
    })
  if (redisEnabled()) {
    const n = await getRedis().get(`login:${key}`)
    if (n && Number(n) >= LOGIN_MAX) throw blocked()
    return
  }
  const w = loginAttempts.get(key)
  if (w && Date.now() < w.resetAt && w.count >= LOGIN_MAX) throw blocked()
}

export async function recordLoginFailure(key: string): Promise<void> {
  if (redisEnabled()) {
    const rk = `login:${key}`
    const r = getRedis()
    const count = await r.incr(rk)
    if (count === 1) await r.expire(rk, Math.floor(LOGIN_WINDOW_MS / 1000))
    return
  }
  const now = Date.now()
  let w = loginAttempts.get(key)
  if (!w || now >= w.resetAt) {
    w = { count: 0, resetAt: now + LOGIN_WINDOW_MS }
    loginAttempts.set(key, w)
  }
  w.count++
}

export async function clearLoginThrottle(key: string): Promise<void> {
  if (redisEnabled()) {
    await getRedis().del(`login:${key}`)
    return
  }
  loginAttempts.delete(key)
}
