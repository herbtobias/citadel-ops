// Citadel Ops — Echelon error capture (§25). Persists unhandled API errors as
// ErrorEvents correlated by traceId, so the Diagnostics view can reconstruct failures.
import { db, schema } from '../db'
import { getTraceId } from '../utils/tracing'
import { captureError } from '../utils/sentry'
import { logger } from '../utils/logger'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', async (error: any, ctx: any) => {
    try {
      const event = ctx?.event
      const url: string = event?.path || event?.node?.req?.url || ''
      // Best-effort projectId extraction from /api/v1/projects/:id/...
      const m = url.match(/\/projects\/([0-9a-f-]{36})/i)
      const traceId = event?.context?.traceId ?? getTraceId()
      const status = error?.statusCode ?? 500
      // Only record genuine faults, not routine 4xx validation/auth.
      if (status < 500) return

      // Structured log + Sentry (no-op unless SENTRY_DSN is set), both traceId-tagged.
      logger.error({ traceId, url, statusCode: status, err: error }, 'unhandled api error')
      captureError(error, { traceId, url, source: 'api' })

      await db.insert(schema.errorEvents).values({
        traceId,
        projectId: m?.[1] ?? null,
        level: 'error',
        source: 'api',
        message: String(error?.message ?? error).slice(0, 2000),
        stack: error?.stack ? String(error.stack).slice(0, 8000) : null,
        context: { url, statusCode: status },
      })
    } catch {
      /* never let telemetry crash the request */
    }
  })
})
