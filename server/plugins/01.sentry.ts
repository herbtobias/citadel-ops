// Citadel Ops — Sentry server init (§25). Env-gated: does nothing unless SENTRY_DSN
// is set. Loaded via dynamic import so the SDK never enters the bundle/hot path when
// unconfigured. Registers a capture fn for captureError() and tags 5xx with traceId.
import { setSentryCapture } from '../utils/sentry'
import { logger } from '../utils/logger'

export default defineNitroPlugin(async () => {
  const dsn = useRuntimeConfig().sentryDsn
  if (!dsn) return

  const Sentry = await import('@sentry/node')
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0, // error tracking only; distributed tracing is via traceId
  })
  setSentryCapture((error, tags) => {
    Sentry.captureException(error, tags ? { tags } : undefined)
  })
  logger.info('Sentry server error-tracking enabled')
})
