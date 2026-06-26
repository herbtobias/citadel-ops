// Citadel Ops — request timing + structured request log (Echelon, §25). Records
// every request into the Prometheus histogram and emits one structured log line
// (mutations/errors at info, GETs at debug to keep the stream readable).
import { metrics, routeLabel } from '../utils/metrics'
import { reqLogger } from '../utils/logger'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    event.context._t0 = process.hrtime.bigint()
  })

  nitroApp.hooks.hook('afterResponse', (event) => {
    try {
      const t0 = event.context._t0 as bigint | undefined
      if (!t0) return
      const sec = Number(process.hrtime.bigint() - t0) / 1e9
      const method = event.method
      const route = routeLabel(event.path)
      const status = event.node.res.statusCode

      metrics.httpDuration.observe({ method, route, status }, sec)

      const line = { method, route, status, ms: Math.round(sec * 1000) }
      const log = reqLogger()
      if (method !== 'GET' || status >= 400) log.info(line, 'request')
      else log.debug(line, 'request')
    } catch {
      /* telemetry must never break a response */
    }
  })
})
