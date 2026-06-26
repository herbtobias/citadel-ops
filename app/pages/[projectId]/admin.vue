<script setup lang="ts">
const route = useRoute()
const orgs = useOrgStore()
const projects = useProjectsStore()
const projectId = computed(() => route.params.projectId as string)
const isManager = computed(() => orgs.activeRole === 'manager')

interface Metrics {
  counts: { total: number; byStatus: Record<string, number> }
  reviewQueue: number
  blocked: number
  done: number
  agents: { active: number; total: number }
}
interface Finops {
  total: { tokens: number; cost: number }
  runs: number
  byAgent: Record<string, { tokens: number; cost: number }>
}
interface TraceEvent {
  event: string
  missionKey: string | null
  fromStatus: string | null
  toStatus: string | null
  message: string | null
  createdAt: string
}
interface Trace {
  traceId: string
  startedAt: string
  actor: string
  actorType: string
  eventCount: number
  errorCount: number
  events: TraceEvent[]
  errors: { source: string; message: string }[]
}

// Org-wide rollup: metrics for every accessible project in the active org.
const orgProjects = computed(() => projects.projects.filter((p) => p.orgId === orgs.activeOrgId))

const { data, refresh } = await useAsyncData(
  'admin',
  async () => {
    if (!isManager.value) return null
    const f = useRequestFetch()
    const rollup = await Promise.all(
      orgProjects.value.map(async (p) => ({
        key: p.key,
        name: p.name,
        metrics: await f<Metrics>(`/api/v1/projects/${p.id}/metrics`),
      })),
    )
    const [finops, traces] = await Promise.all([
      f<Finops>(`/api/v1/projects/${projectId.value}/finops`),
      f<Trace[]>(`/api/v1/projects/${projectId.value}/traces?limit=30`),
    ])
    return { rollup, finops, traces }
  },
  { watch: [projectId, () => orgs.activeOrgId] },
)

const open = ref<Set<string>>(new Set())
function toggle(id: string) {
  if (open.value.has(id)) open.value.delete(id)
  else open.value.add(id)
  open.value = new Set(open.value)
}
function fmt(d: string) {
  return new Date(d).toISOString().slice(11, 19) + 'Z'
}

// Live updates via SSE (reconnects on project switch).
let liveTimer: any = null
useProjectEvents(projectId, () => {
  clearTimeout(liveTimer)
  liveTimer = setTimeout(() => refresh(), 500)
})
onBeforeUnmount(() => clearTimeout(liveTimer))

const actorColor: Record<string, string> = {
  agent: 'text-accent',
  human: 'text-accent-tertiary',
  system: 'text-muted-foreground',
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-8">
    <div class="flex items-center gap-3">
      <Icon name="lucide:shield" class="size-7 text-accent" />
      <h1 class="ct-heading text-xl font-bold">Admin — Citadel</h1>
    </div>

    <p
      v-if="!isManager"
      class="ct-card border border-border bg-card p-4 text-sm text-muted-foreground"
    >
      Admin metrics &amp; tracing are manager-only. Your role:
      <span class="text-accent">{{ orgs.activeRole ?? '—' }}</span
      >.
    </p>

    <template v-else-if="data">
      <!-- Org rollup -->
      <section class="ct-card border border-border bg-card p-5">
        <h2 class="ct-label mb-3 text-muted-foreground">Projects — {{ orgs.activeOrg?.name }}</h2>
        <table class="w-full text-sm">
          <thead>
            <tr class="ct-label border-b border-border text-left text-muted-foreground">
              <th class="py-2">Project</th>
              <th>Missions</th>
              <th>Done</th>
              <th>Review</th>
              <th>Blocked</th>
              <th>Agents</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in data.rollup" :key="r.key" class="border-b border-border/50">
              <td class="py-2">
                <span class="ct-label text-accent">{{ r.key }}</span> {{ r.name }}
              </td>
              <td>{{ r.metrics.counts.total }}</td>
              <td class="text-accent">{{ r.metrics.done }}</td>
              <td>{{ r.metrics.reviewQueue }}</td>
              <td :class="r.metrics.blocked ? 'text-destructive' : ''">{{ r.metrics.blocked }}</td>
              <td>{{ r.metrics.agents.active }}/{{ r.metrics.agents.total }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- FinOps -->
      <section class="ct-card border border-border bg-card p-5">
        <h2 class="ct-label mb-3 text-muted-foreground">Cost Attribution — active project</h2>
        <div class="mb-3 flex gap-6">
          <div>
            <p class="ct-label text-muted-foreground">Token spend</p>
            <p class="text-lg font-bold">{{ data.finops.total.tokens.toLocaleString('en-US') }}</p>
          </div>
          <div>
            <p class="ct-label text-muted-foreground">Cost</p>
            <p class="text-lg font-bold">{{ data.finops.total.cost }}</p>
          </div>
          <div>
            <p class="ct-label text-muted-foreground">Agent runs</p>
            <p class="text-lg font-bold">{{ data.finops.runs }}</p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="(v, agent) in data.finops.byAgent"
            :key="agent"
            class="ct-label rounded bg-muted px-2 py-1 text-muted-foreground"
          >
            {{ agent }}: <span class="text-foreground">{{ v.tokens }}t</span>
          </span>
        </div>
      </section>

      <!-- Trace log -->
      <section class="ct-card border border-border bg-card p-5">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="ct-label text-muted-foreground">
            Trace Log — agent &amp; HQ requests (by traceId)
          </h2>
          <span class="ct-label flex items-center gap-1.5 text-muted-foreground"
            ><span class="size-2 rounded-full bg-accent ct-glow-sm" /> live</span
          >
        </div>
        <ul class="space-y-1">
          <li v-for="t in data.traces" :key="t.traceId" class="border-b border-border/50">
            <button
              class="flex w-full items-center justify-between py-2 text-left text-sm hover:text-accent"
              @click="toggle(t.traceId)"
            >
              <span class="flex items-center gap-2">
                <Icon
                  :name="open.has(t.traceId) ? 'lucide:chevron-down' : 'lucide:chevron-right'"
                  class="size-4"
                />
                <span class="ct-label" :class="actorColor[t.actorType]">{{ t.actor }}</span>
                <span class="text-muted-foreground"
                  >{{
                    t.events
                      .map((e) => e.event)
                      .slice(0, 3)
                      .join(', ')
                  }}{{ t.eventCount > 3 ? '…' : '' }}</span
                >
              </span>
              <span class="flex items-center gap-2">
                <span v-if="t.errorCount" class="ct-label text-destructive"
                  >{{ t.errorCount }} err</span
                >
                <span class="ct-label text-muted-foreground">{{ fmt(t.startedAt) }}</span>
                <code class="ct-label text-muted-foreground">{{ t.traceId.slice(0, 8) }}</code>
              </span>
            </button>
            <div v-if="open.has(t.traceId)" class="ml-6 space-y-1 pb-3 text-xs">
              <div v-for="(e, i) in t.events" :key="i" class="flex gap-2">
                <span class="ct-label text-muted-foreground">{{ fmt(e.createdAt) }}</span>
                <span class="text-foreground">{{ e.event }}</span>
                <span v-if="e.missionKey" class="text-accent">{{ e.missionKey }}</span>
                <span v-if="e.fromStatus || e.toStatus" class="text-muted-foreground"
                  >{{ e.fromStatus }}→{{ e.toStatus }}</span
                >
                <span v-if="e.message" class="text-muted-foreground">— {{ e.message }}</span>
              </div>
              <div v-for="(er, i) in t.errors" :key="'e' + i" class="text-destructive">
                ✗ {{ er.source }}: {{ er.message }}
              </div>
            </div>
          </li>
          <li v-if="!data.traces.length" class="py-3 text-sm text-muted-foreground">
            No traced requests yet.
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
