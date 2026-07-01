// Citadel Ops — event bus (Leiter/SSE backplane, §13). In-process by default; with a Redis
// backplane (§HORIZON M2) events fan out across instances so an SSE client on instance A sees
// events emitted on instance B. The public API (publishEvent/subscribeEvents) is unchanged, so
// activity.ts, plugins/leiter.ts and events.get.ts stay untouched.
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { redisEnabled, getRedis, getRedisSub } from './redis'

export interface CitadelEvent {
  projectId: string | null
  type: string
  missionId?: string | null
  message?: string | null
  traceId?: string | null
  ts: number
}

const CHANNEL = 'citadel:events'
const INSTANCE = randomUUID() // tag our own publishes so we don't double-deliver on loopback
const bus = new EventEmitter()
bus.setMaxListeners(0)

let redisBusReady = false
// Subscribe (once per process) to other instances' events and re-emit them locally. The local
// SSE streams hang off `bus`, so this is how instance B's events reach instance A's clients.
function ensureRedisBus() {
  if (redisBusReady || !redisEnabled()) return
  redisBusReady = true
  const sub = getRedisSub()
  sub.subscribe(CHANNEL).catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[redis] event subscribe failed:', e?.message ?? e)
  })
  sub.on('message', (channel, payload) => {
    if (channel !== CHANNEL) return
    try {
      const { origin, event } = JSON.parse(payload) as { origin: string; event: CitadelEvent }
      if (origin === INSTANCE) return // we already emitted it locally
      bus.emit('event', event)
    } catch {
      /* ignore malformed backplane payloads */
    }
  })
}

export function publishEvent(e: Omit<CitadelEvent, 'ts'>) {
  const event: CitadelEvent = { ...e, ts: Date.now() }
  bus.emit('event', event) // our own SSE clients, immediately (low latency)
  if (redisEnabled()) {
    ensureRedisBus()
    getRedis()
      .publish(CHANNEL, JSON.stringify({ origin: INSTANCE, event }))
      .catch(() => {})
  }
}

export function subscribeEvents(fn: (e: CitadelEvent) => void): () => void {
  ensureRedisBus() // our clients must also receive OTHER instances' events
  bus.on('event', fn)
  return () => bus.off('event', fn)
}
