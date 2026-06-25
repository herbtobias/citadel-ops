// Citadel Ops — in-process event bus (Leiter/SSE backplane, §13). Single-process
// for the MVP; Redis pub/sub replaces this at scale (§24/P10).
import { EventEmitter } from 'node:events'

export interface CitadelEvent {
  projectId: string | null
  type: string
  missionId?: string | null
  message?: string | null
  traceId?: string | null
  ts: number
}

const bus = new EventEmitter()
bus.setMaxListeners(0)

export function publishEvent(e: Omit<CitadelEvent, 'ts'>) {
  bus.emit('event', { ...e, ts: Date.now() } satisfies CitadelEvent)
}

export function subscribeEvents(fn: (e: CitadelEvent) => void): () => void {
  bus.on('event', fn)
  return () => bus.off('event', fn)
}
