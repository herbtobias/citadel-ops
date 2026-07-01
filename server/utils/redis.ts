// Citadel Ops — Redis backplane (§HORIZON M1). Shared state across instances: the SSE/webhook
// event fan-out (M2) and the distributed rate-limit / login-throttle counters (M4). A subscribed
// connection can't issue normal commands, so we keep the command connection (also used to publish)
// separate from the dedicated subscriber. Lazy singletons — nothing connects until first use.
import Redis from 'ioredis'

const url = () => process.env.REDIS_URL

// Whether a Redis backplane is configured. Without it, the app runs single-instance (in-process
// event bus + in-memory counters); `00.env-check.ts` makes REDIS_URL mandatory in production.
export function redisEnabled(): boolean {
  return !!url()
}

let cmd: Redis | null = null
let sub: Redis | null = null

function make(): Redis {
  const client = new Redis(url()!, { maxRetriesPerRequest: null, enableReadyCheck: true })
  // Never let a backplane hiccup crash the process — log and keep serving from local state.
  client.on('error', (e) => {
    // eslint-disable-next-line no-console
    console.error('[redis] connection error:', e?.message ?? e)
  })
  return client
}

// Command + publish connection.
export function getRedis(): Redis {
  if (!url()) throw new Error('REDIS_URL is not set')
  if (!cmd) cmd = make()
  return cmd
}

// Dedicated subscriber connection (kept apart from the command client).
export function getRedisSub(): Redis {
  if (!url()) throw new Error('REDIS_URL is not set')
  if (!sub) sub = make()
  return sub
}

// Liveness for /health and Echelon.
export async function redisHealthy(): Promise<boolean> {
  if (!url()) return false
  try {
    return (await getRedis().ping()) === 'PONG'
  } catch {
    return false
  }
}
