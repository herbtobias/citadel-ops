// Citadel Ops — assigns a traceId to every request and binds it to the async context
// (Echelon, §25). Downstream logActivity / ErrorEvents inherit it; echoed back so the
// client can correlate.
import { genTraceId, traceIdFromHeaders, traceStore } from '~~/server/utils/tracing'

export default defineEventHandler((event) => {
  const traceId = traceIdFromHeaders(getHeader(event, 'traceparent'), getHeader(event, 'x-trace-id')) || genTraceId()
  event.context.traceId = traceId
  // enterWith binds the id for the rest of this request's async chain.
  traceStore.enterWith({ traceId })
  setResponseHeader(event, 'x-trace-id', traceId)
})
