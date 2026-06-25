// Citadel Ops — Echelon trace context (§25). A request-scoped traceId carried via
// AsyncLocalStorage so logActivity/ErrorEvents pick it up automatically, correlating
// frontend → API → runner. (Full OpenTelemetry spans are deferred infra, §19.)
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomBytes } from 'node:crypto'

export const traceStore = new AsyncLocalStorage<{ traceId: string }>()

export function genTraceId(): string {
  return randomBytes(16).toString('hex') // W3C trace-id shape (16 bytes hex)
}

export function getTraceId(): string | null {
  return traceStore.getStore()?.traceId ?? null
}

// Extracts a trace id from W3C `traceparent` or an explicit `x-trace-id` header.
export function traceIdFromHeaders(traceparent?: string | null, xTraceId?: string | null): string | null {
  if (xTraceId) return xTraceId
  if (traceparent) {
    const parts = traceparent.split('-')
    if (parts.length >= 2 && parts[1]) return parts[1]
  }
  return null
}
