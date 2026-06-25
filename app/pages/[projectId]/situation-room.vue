<script setup lang="ts">
import type { Mission, Operation, Agent } from '~/types'

const route = useRoute()
const projectId = computed(() => route.params.projectId as string)

interface Metrics {
  counts: { byStatus: Record<string, number>, total: number }
  reviewQueue: number, blocked: number, coldReadPending: number, done: number
  reworkCount: number, avgLeadTimeHours: number | null
  spend: { tokens: number, cost: number }
  agents: { total: number, active: number, revoked: number }
}

const { data, refresh } = await useAsyncData(
  'situation-room',
  async () => {
    const f = useRequestFetch()
    const [metrics, agents, operations, missions] = await Promise.all([
      f<Metrics>(`/api/v1/projects/${projectId.value}/metrics`),
      f<Agent[]>(`/api/v1/projects/${projectId.value}/agents`),
      f<Operation[]>(`/api/v1/projects/${projectId.value}/operations`),
      f<Mission[]>(`/api/v1/projects/${projectId.value}/missions`),
    ])
    return { metrics, agents, operations, missions }
  },
  { watch: [projectId] },
)

const activeOp = computed(() => data.value?.operations.find(o => o.status === 'active'))
const reviewQueue = computed(() => data.value?.missions.filter(m => m.status === 'in_review') ?? [])
const blocked = computed(() => data.value?.missions.filter(m => m.status === 'blocked') ?? [])
const coldRead = computed(() => data.value?.missions.filter(m => m.status === 'cold_read') ?? [])

const reviewError = ref('')
async function review(mission: Mission, approve: boolean) {
  reviewError.value = ''
  try {
    await $fetch(`/api/v1/missions/${mission.id}/transition`, {
      method: 'POST',
      body: { to: approve ? 'done' : 'in_progress', message: approve ? 'Review approved' : 'Review rejected — back to work' },
    })
    await refresh()
  }
  catch (e: any) {
    reviewError.value = `${mission.key}: ${e?.data?.statusMessage || e?.statusMessage || 'transition failed'}`
  }
}

// Live updates via SSE (reconnects on project switch).
let liveTimer: any = null
useProjectEvents(projectId, () => { clearTimeout(liveTimer); liveTimer = setTimeout(() => refresh(), 300) })
onBeforeUnmount(() => clearTimeout(liveTimer))

const statusOrder = ['backlog', 'designing', 'cold_read', 'ready', 'in_progress', 'in_review', 'blocked', 'done']
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-8">
    <div class="flex items-center gap-3">
      <Icon name="lucide:radar" class="size-7 text-accent" />
      <h1 class="ct-heading text-xl font-bold">Situation Room</h1>
      <span class="ct-label ml-auto flex items-center gap-1.5 text-muted-foreground">
        <span class="size-2 rounded-full bg-accent ct-glow-sm" /> live
      </span>
    </div>

    <!-- Metric cards -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="ct-card border border-border bg-card p-4">
        <p class="ct-label text-muted-foreground">Review Queue</p>
        <p class="ct-heading text-3xl font-bold">{{ data?.metrics.reviewQueue }}</p>
      </div>
      <div class="ct-card border border-border bg-card p-4">
        <p class="ct-label text-muted-foreground">Blocked</p>
        <p class="ct-heading text-3xl font-bold" :class="data?.metrics.blocked ? 'text-destructive' : ''">{{ data?.metrics.blocked }}</p>
      </div>
      <div class="ct-card border border-border bg-card p-4">
        <p class="ct-label text-muted-foreground">Cold Read</p>
        <p class="ct-heading text-3xl font-bold">{{ data?.metrics.coldReadPending }}</p>
      </div>
      <div class="ct-card border border-border bg-card p-4">
        <p class="ct-label text-muted-foreground">Done</p>
        <p class="ct-heading text-3xl font-bold text-accent">{{ data?.metrics.done }}</p>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="ct-card border border-border bg-card p-4">
        <p class="ct-label text-muted-foreground">Avg Lead Time</p>
        <p class="text-lg font-bold">{{ data?.metrics.avgLeadTimeHours != null ? data?.metrics.avgLeadTimeHours + 'h' : '—' }}</p>
      </div>
      <div class="ct-card border border-border bg-card p-4">
        <p class="ct-label text-muted-foreground">Rework / Bounce</p>
        <p class="text-lg font-bold">{{ data?.metrics.reworkCount }}</p>
      </div>
      <div class="ct-card border border-border bg-card p-4">
        <p class="ct-label text-muted-foreground">Token Spend</p>
        <p class="text-lg font-bold">{{ data?.metrics.spend.tokens.toLocaleString('en-US') }}</p>
      </div>
      <div class="ct-card border border-border bg-card p-4">
        <p class="ct-label text-muted-foreground">Agents Active</p>
        <p class="text-lg font-bold text-accent">{{ data?.metrics.agents.active }}/{{ data?.metrics.agents.total }}</p>
      </div>
    </div>

    <!-- Active operation -->
    <section v-if="activeOp" class="ct-card border border-border bg-card p-5">
      <p class="ct-label mb-1 text-muted-foreground">Active Operation</p>
      <h2 class="ct-heading text-lg font-bold">{{ activeOp.codename }} <span class="text-accent">· {{ activeOp.key }}</span></h2>
      <p class="mt-1 text-sm text-muted-foreground">{{ activeOp.objective }}</p>
      <div class="mt-2 flex flex-wrap gap-1">
        <span v-for="s in activeOp.sectorsInScope" :key="s" class="ct-label rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{{ s }}</span>
      </div>
    </section>

    <div class="grid gap-6 lg:grid-cols-2">
      <!-- Review queue -->
      <section class="ct-card border border-border bg-card p-5">
        <h2 class="ct-label mb-3 text-muted-foreground">Review Queue (non-blocking)</h2>
        <p v-if="reviewError" class="ct-label mb-2 text-destructive">{{ reviewError }}</p>
        <ul class="space-y-2">
          <li v-for="m in reviewQueue" :key="m.id" class="flex items-center justify-between border-b border-border/50 pb-2 text-sm">
            <div>
              <span class="ct-label text-accent">{{ m.key }}</span> · {{ m.title }}
              <span v-if="m.claimedByAlias" class="ct-label ml-1 text-muted-foreground">{{ m.claimedByAlias }}</span>
            </div>
            <div class="flex gap-2">
              <button class="ct-label text-accent hover:underline" @click="review(m, true)">approve</button>
              <button class="ct-label text-destructive hover:underline" @click="review(m, false)">reject</button>
            </div>
          </li>
          <li v-if="!reviewQueue.length" class="text-sm text-muted-foreground">Nothing awaiting review.</li>
        </ul>
      </section>

      <!-- Agent roster -->
      <section class="ct-card border border-border bg-card p-5">
        <h2 class="ct-label mb-3 text-muted-foreground">Agent Roster</h2>
        <ul class="space-y-2 text-sm">
          <li v-for="a in data?.agents" :key="a.alias" class="flex items-center justify-between border-b border-border/50 pb-2">
            <div class="flex items-center gap-2">
              <span class="flex size-6 items-center justify-center rounded-full border border-accent text-[10px] text-accent">{{ a.alias }}</span>
              <span class="text-muted-foreground">{{ a.sectors.join(', ') }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span v-if="a.currentMissionKey" class="ct-label text-accent-tertiary">{{ a.currentMissionKey }}</span>
              <span class="ct-label" :class="a.status === 'active' ? 'text-accent' : a.status === 'revoked' ? 'text-destructive' : 'text-muted-foreground'">{{ a.status }}</span>
            </div>
          </li>
          <li v-if="!data?.agents?.length" class="text-muted-foreground">No agents.</li>
        </ul>
      </section>

      <!-- Blocked -->
      <section class="ct-card border border-border bg-card p-5">
        <h2 class="ct-label mb-3 text-muted-foreground">Blocked</h2>
        <ul class="space-y-2 text-sm">
          <li v-for="m in blocked" :key="m.id" class="border-b border-border/50 pb-2">
            <span class="ct-label text-destructive">{{ m.key }}</span> · {{ m.title }}
          </li>
          <li v-if="!blocked.length" class="text-muted-foreground">No blockers.</li>
        </ul>
      </section>

      <!-- Cold read pending -->
      <section class="ct-card border border-border bg-card p-5">
        <h2 class="ct-label mb-3 text-muted-foreground">Cold Read Pending</h2>
        <ul class="space-y-2 text-sm">
          <li v-for="m in coldRead" :key="m.id" class="border-b border-border/50 pb-2">
            <span class="ct-label text-accent">{{ m.key }}</span> · {{ m.title }}
          </li>
          <li v-if="!coldRead.length" class="text-muted-foreground">No dossiers awaiting Cold Read.</li>
        </ul>
      </section>
    </div>

    <!-- Status distribution -->
    <section class="ct-card border border-border bg-card p-5">
      <h2 class="ct-label mb-3 text-muted-foreground">Status Distribution</h2>
      <div class="flex flex-wrap gap-2">
        <span v-for="s in statusOrder" :key="s" class="ct-label rounded bg-muted px-2 py-1 text-muted-foreground">
          {{ s.replace('_', ' ') }}: <span class="text-foreground">{{ data?.metrics.counts.byStatus[s] ?? 0 }}</span>
        </span>
      </div>
    </section>
  </div>
</template>
