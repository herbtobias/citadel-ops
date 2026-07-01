// GET /health — liveness/readiness probe (§25). Checks the DB and (if configured) Redis.
import { sql } from 'drizzle-orm'
import { db } from '~~/server/db'
import { redisEnabled, redisHealthy } from '~~/server/utils/redis'

export default defineEventHandler(async (event) => {
  const checks: Record<string, string> = {}
  let healthy = true
  try {
    await db.execute(sql`select 1`)
    checks.db = 'ok'
  } catch (e: any) {
    checks.db = `error: ${e?.message ?? e}`
    healthy = false
  }

  // Redis is the multi-instance backplane (§HORIZON M1) — degrade if it's configured but down.
  if (redisEnabled()) {
    const ok = await redisHealthy()
    checks.redis = ok ? 'ok' : 'error'
    if (!ok) healthy = false
  } else {
    checks.redis = 'disabled (in-process fallback)'
  }

  if (!healthy) setResponseStatus(event, 503)
  return { status: healthy ? 'ok' : 'degraded', checks, ts: new Date().toISOString() }
})
