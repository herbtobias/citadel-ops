// Citadel Ops — thin Sentry capture holder (§25). The @sentry/node SDK is only
// loaded (dynamic import) when a DSN is configured, in server/plugins/01.sentry.ts;
// that plugin registers the capture fn here. Everything else calls captureError()
// which is a safe no-op until/unless Sentry is wired. Keeps Sentry out of the hot
// path and the bundle when unused.
type CaptureFn = (error: unknown, tags?: Record<string, string>) => void

let _capture: CaptureFn | null = null

export function setSentryCapture(fn: CaptureFn) {
  _capture = fn
}

export function captureError(error: unknown, tags?: Record<string, string>) {
  try {
    _capture?.(error, tags)
  } catch {
    /* never let telemetry crash the request */
  }
}
