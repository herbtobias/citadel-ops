// Shared live-event subscription (SSE). Opens one EventSource for the given project
// and re-connects when the project changes (the topbar & board persist across project
// switches, so a plain onMounted connect would stay stuck on the old project). §13.
import type { Ref } from 'vue'

export interface LiveEvent {
  type: string
  projectId: string | null
  missionId?: string | null
  message?: string | null
  traceId?: string | null
  ts: number
}

export function useProjectEvents(
  projectId: Ref<string | undefined>,
  onEvent: (e: LiveEvent) => void,
) {
  let es: EventSource | null = null

  function connect() {
    if (es) {
      es.close()
      es = null
    }
    const id = unref(projectId)
    if (!id || !import.meta.client) return
    es = new EventSource(`/api/v1/events?projectId=${id}`)
    es.onmessage = (ev) => {
      try {
        onEvent(JSON.parse(ev.data) as LiveEvent)
      } catch {
        /* ignore malformed frames (e.g. the initial hello) */
      }
    }
  }

  onMounted(connect)
  watch(projectId, connect)
  onBeforeUnmount(() => {
    if (es) {
      es.close()
      es = null
    }
  })
}
