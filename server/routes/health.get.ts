// GET /health — liveness/readiness probe (§25). Checks the DB connection.
import { sql } from 'drizzle-orm'
import { db } from '~~/server/db'

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
  if (!healthy) setResponseStatus(event, 503)
  return { status: healthy ? 'ok' : 'degraded', checks, ts: new Date().toISOString() }
})
