// Citadel Ops — Prometheus metrics (Echelon, §25/§26). RED-style HTTP metrics plus
// default process metrics, exposed at GET /metrics. Singleton stashed on globalThis
// so dev HMR re-imports don't double-register (prom-client throws on that).
import client from 'prom-client'

type Metrics = {
  registry: client.Registry
  httpDuration: client.Histogram<'method' | 'route' | 'status'>
}

const g = globalThis as unknown as { __citadelMetrics?: Metrics }

function build(): Metrics {
  const registry = new client.Registry()
  client.collectDefaultMetrics({ register: registry })
  const httpDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    registers: [registry],
  })
  return { registry, httpDuration }
}

export const metrics: Metrics = g.__citadelMetrics ?? (g.__citadelMetrics = build())

// Collapse high-cardinality ids so the `route` label stays bounded.
export function routeLabel(path: string): string {
  return (path.split('?')[0] || '/')
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:n')
}
