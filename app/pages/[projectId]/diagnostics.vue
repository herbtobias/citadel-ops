<script setup lang="ts">
const route = useRoute()
const projectId = computed(() => route.params.projectId as string)

interface Health { status: string, checks: Record<string, string> }
interface Verify { intact: boolean, entries: number, brokenAt?: { event: string, createdAt: string } }
interface ErrEvent { id: string, traceId: string | null, source: string, level: string, message: string, createdAt: string }
interface Dep { id: string, missionKey: string | null, agentAlias: string | null, runnerStatus: string, startedAt: string, finishedAt: string | null }

const { data, refresh } = await useAsyncData(
  'diagnostics',
  async () => {
    const f = useRequestFetch()
    const [health, verify, errors, deployments] = await Promise.all([
      f<Health>('/health'),
      f<Verify>(`/api/v1/projects/${projectId.value}/audit-verify`),
      f<ErrEvent[]>(`/api/v1/projects/${projectId.value}/errors`),
      f<Dep[]>(`/api/v1/projects/${projectId.value}/deployments`),
    ])
    return { health, verify, errors, deployments }
  },
  { watch: [projectId] },
)

function fmt(d: string) { return new Date(d).toISOString().slice(0, 19).replace('T', ' ') + ' UTC' }
const runnerColor: Record<string, string> = {
  running: 'text-accent-tertiary', succeeded: 'text-accent', failed: 'text-destructive', idle: 'text-muted-foreground', cancelled: 'text-muted-foreground',
}

// Live updates via SSE (reconnects on project switch).
let liveTimer: any = null
useProjectEvents(projectId, () => { clearTimeout(liveTimer); liveTimer = setTimeout(() => refresh(), 400) })
onBeforeUnmount(() => clearTimeout(liveTimer))
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-8">
    <div class="flex items-center gap-3">
      <Icon name="lucide:activity" class="size-7 text-accent" />
      <h1 class="ct-heading text-xl font-bold">Diagnostics — Echelon</h1>
    </div>

    <!-- Health + integrity -->
    <div class="grid gap-3 sm:grid-cols-2">
      <div class="ct-card border border-border bg-card p-5">
        <p class="ct-label mb-2 text-muted-foreground">System Health</p>
        <p class="ct-heading text-2xl font-bold" :class="data?.health.status === 'ok' ? 'text-accent' : 'text-destructive'">
          {{ data?.health.status }}
        </p>
        <ul class="mt-2 space-y-1 text-sm">
          <li v-for="(v, k) in data?.health.checks" :key="k" class="flex justify-between">
            <span class="text-muted-foreground">{{ k }}</span><span :class="v === 'ok' ? 'text-accent' : 'text-destructive'">{{ v }}</span>
          </li>
        </ul>
      </div>

      <div class="ct-card border border-border bg-card p-5">
        <p class="ct-label mb-2 text-muted-foreground">The Wire — Tamper Evidence</p>
        <p class="ct-heading text-2xl font-bold" :class="data?.verify.intact ? 'text-accent' : 'text-destructive'">
          {{ data?.verify.intact ? 'INTACT' : 'BROKEN' }}
        </p>
        <p class="mt-2 text-sm text-muted-foreground">{{ data?.verify.entries }} hash-chained entries</p>
        <p v-if="data?.verify.brokenAt" class="ct-label mt-1 text-destructive">broken at: {{ data.verify.brokenAt.event }}</p>
      </div>
    </div>

    <!-- Runner deployments -->
    <section class="ct-card border border-border bg-card p-5">
      <h2 class="ct-label mb-3 text-muted-foreground">Agent Runs (Deployments)</h2>
      <table class="w-full text-sm">
        <thead>
          <tr class="ct-label border-b border-border text-left text-muted-foreground">
            <th class="py-2">Mission</th><th>Agent</th><th>Runner</th><th>Started</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in data?.deployments" :key="d.id" class="border-b border-border/50">
            <td class="py-2 text-accent">{{ d.missionKey }}</td>
            <td>{{ d.agentAlias ?? '—' }}</td>
            <td><span :class="runnerColor[d.runnerStatus]">{{ d.runnerStatus }}</span></td>
            <td class="text-muted-foreground">{{ fmt(d.startedAt) }}</td>
          </tr>
          <tr v-if="!data?.deployments?.length"><td colspan="4" class="py-3 text-center text-muted-foreground">No agent runs yet.</td></tr>
        </tbody>
      </table>
    </section>

    <!-- Error feed -->
    <section class="ct-card border border-border bg-card p-5">
      <h2 class="ct-label mb-3 text-muted-foreground">Error Events</h2>
      <ul class="space-y-2">
        <li v-for="e in data?.errors" :key="e.id" class="border-b border-border/50 pb-2 text-sm">
          <div class="flex items-center justify-between">
            <span class="ct-label text-destructive">{{ e.source }} · {{ e.level }}</span>
            <span class="ct-label text-muted-foreground">{{ fmt(e.createdAt) }}</span>
          </div>
          <p class="text-foreground">{{ e.message }}</p>
          <p v-if="e.traceId" class="ct-label text-muted-foreground">trace {{ e.traceId.slice(0, 12) }}…</p>
        </li>
        <li v-if="!data?.errors?.length" class="text-sm text-muted-foreground">No errors recorded. All clear.</li>
      </ul>
    </section>
  </div>
</template>
