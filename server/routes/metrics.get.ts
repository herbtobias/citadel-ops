// GET /metrics — Prometheus scrape endpoint (Echelon, §25). Open by default; if
// METRICS_TOKEN is set it must be presented as a Bearer token (so you can expose
// the port without leaking internals).
import { metrics } from '../utils/metrics'

export default defineEventHandler(async (event) => {
  const token = process.env.METRICS_TOKEN
  if (token && getHeader(event, 'authorization') !== `Bearer ${token}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  setHeader(event, 'content-type', metrics.registry.contentType)
  return await metrics.registry.metrics()
})
