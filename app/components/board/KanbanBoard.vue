<script setup lang="ts">
import type { Mission, MissionStatus } from '~/types'

const props = defineProps<{ projectId: string }>()

const projects = useProjectsStore()
const missionsStore = useMissionsStore()

const columns = computed<MissionStatus[]>(
  () => projects.byId(props.projectId)?.statusColumns ?? [],
)

function columnMissions(status: MissionStatus) {
  return missionsStore.byStatus(props.projectId, status)
}

const selected = ref<Mission | null>(null)

function onMove(id: string, status: MissionStatus) {
  missionsStore.moveMission(id, status)
}

// Open a linked mission by key (from the detail drawer's reference list).
function openByKey(key: string) {
  const m = missionsStore.byKey(key)
  if (m) selected.value = m
}

// ── Reference lines overlay ────────────────────────────────────────────────
const showLines = ref(true)
const scrollEl = ref<HTMLElement | null>(null)
const svgSize = ref({ w: 0, h: 0 })

interface Line { x1: number, y1: number, x2: number, y2: number, key: string }
const lines = ref<Line[]>([])

// Unordered, deduplicated mission→mission edges (one line per related pair).
const edges = computed(() => {
  const seen = new Set<string>()
  const out: { a: string, b: string }[] = []
  for (const m of missionsStore.byProject(props.projectId)) {
    for (const l of m.links) {
      if (l.targetKind !== 'mission') continue
      const pair = [m.key, l.targetKey].sort()
      const id = pair.join('|')
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ a: m.key, b: l.targetKey })
    }
  }
  return out
})

function measure() {
  const board = scrollEl.value
  if (!board) return
  svgSize.value = { w: board.scrollWidth, h: board.scrollHeight }
  const boardRect = board.getBoundingClientRect()
  const center = (key: string) => {
    const el = board.querySelector<HTMLElement>(`[data-mission-key="${CSS.escape(key)}"]`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      x: r.left - boardRect.left + board.scrollLeft + r.width / 2,
      y: r.top - boardRect.top + board.scrollTop + r.height / 2,
    }
  }
  const next: Line[] = []
  for (const e of edges.value) {
    const a = center(e.a)
    const b = center(e.b)
    if (a && b) next.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, key: `${e.a}|${e.b}` })
  }
  lines.value = next
}

function scheduleMeasure() {
  requestAnimationFrame(() => requestAnimationFrame(measure))
}

let ro: ResizeObserver | null = null
onMounted(() => {
  scheduleMeasure()
  if (scrollEl.value) {
    ro = new ResizeObserver(scheduleMeasure)
    ro.observe(scrollEl.value)
  }
})
onBeforeUnmount(() => ro?.disconnect())
watch([() => missionsStore.byProject(props.projectId), showLines, columns], scheduleMeasure, { deep: true })

// A gentle quadratic curve between two points.
function path(l: Line) {
  const mx = (l.x1 + l.x2) / 2
  return `M ${l.x1} ${l.y1} C ${mx} ${l.y1}, ${mx} ${l.y2}, ${l.x2} ${l.y2}`
}
</script>

<template>
  <div class="relative flex h-full flex-col">
    <div class="mb-2 flex justify-end">
      <button
        class="ct-label flex items-center gap-1.5 rounded-[var(--radius-card)] border border-border px-2 py-1 transition-colors"
        :class="showLines ? 'border-accent text-accent' : 'text-muted-foreground hover:text-accent'"
        @click="showLines = !showLines"
      >
        <Icon name="lucide:waypoints" class="size-4" />
        References
      </button>
    </div>

    <div ref="scrollEl" class="relative flex flex-1 gap-4 overflow-x-auto pb-4">
      <!-- Reference graph overlay (scrolls with content) -->
      <svg
        v-if="showLines && lines.length"
        class="pointer-events-none absolute left-0 top-0 z-10"
        :width="svgSize.w"
        :height="svgSize.h"
        :viewBox="`0 0 ${svgSize.w} ${svgSize.h}`"
      >
        <defs>
          <marker id="ct-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-accent-tertiary)" />
          </marker>
        </defs>
        <path
          v-for="l in lines"
          :key="l.key"
          :d="path(l)"
          fill="none"
          stroke="var(--color-accent-tertiary)"
          stroke-width="1.5"
          stroke-opacity="0.5"
          stroke-dasharray="4 3"
          marker-end="url(#ct-arrow)"
        />
      </svg>

      <KanbanColumn
        v-for="status in columns"
        :key="status"
        :status="status"
        :missions="columnMissions(status)"
        @open="selected = $event"
        @move="onMove"
      />

      <MissionDetail
        :mission="selected"
        @close="selected = null"
        @open-key="openByKey"
      />
    </div>
  </div>
</template>
