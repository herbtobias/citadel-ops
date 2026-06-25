<script setup lang="ts">
const route = useRoute()
const orgs = useOrgStore()
const projectId = computed(() => route.params.projectId as string)
const isManager = computed(() => orgs.activeRole === 'manager')

interface Entry {
  id: string, event: string, missionKey: string | null, fromStatus: string | null, toStatus: string | null
  message: string | null, actor: string, actorType: string, createdAt: string
}

const { data: entries, refresh } = await useAsyncData(
  'audit',
  () => useRequestFetch()<Entry[]>(`/api/v1/projects/${projectId.value}/activity?limit=150`),
  { watch: [projectId] },
)

// Control orders
const orderType = ref<'pause' | 'resume' | 'stand_down' | 'message'>('stand_down')
const orderMsg = ref('')
const orderError = ref('')

async function issueOrder() {
  orderError.value = ''
  try {
    await $fetch(`/api/v1/projects/${projectId.value}/orders`, {
      method: 'POST',
      body: { type: orderType.value, broadcast: true, payload: orderMsg.value ? { message: orderMsg.value } : undefined },
    })
    orderMsg.value = ''
    await refresh()
  }
  catch (e: any) {
    orderError.value = e?.data?.statusMessage || e?.statusMessage || 'Could not issue order'
  }
}

const actorColor: Record<string, string> = { agent: 'text-accent', human: 'text-accent-tertiary', system: 'text-muted-foreground' }
function fmt(d: string) {
  return new Date(d).toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
}

// Live append (reconnects on project switch).
let liveTimer: any = null
useProjectEvents(projectId, () => { clearTimeout(liveTimer); liveTimer = setTimeout(() => refresh(), 300) })
onBeforeUnmount(() => clearTimeout(liveTimer))
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8">
    <div class="flex items-center gap-3">
      <Icon name="lucide:scroll-text" class="size-7 text-accent" />
      <h1 class="ct-heading text-xl font-bold">Control &amp; Audit — The Wire</h1>
    </div>

    <!-- Control orders -->
    <section v-if="isManager" class="ct-card border border-border bg-card p-5">
      <h2 class="ct-label mb-3 text-muted-foreground">Broadcast Order</h2>
      <form class="flex flex-wrap items-end gap-3" @submit.prevent="issueOrder">
        <select v-model="orderType"
          class="rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none">
          <option value="stand_down">stand_down</option>
          <option value="pause">pause</option>
          <option value="resume">resume</option>
          <option value="message">message</option>
        </select>
        <input v-model="orderMsg" placeholder="optional message"
          class="flex-1 min-w-[160px] rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none">
        <button type="submit"
          class="ct-glow-sm rounded-[var(--radius-card)] bg-accent px-4 py-2 text-sm font-bold text-background hover:opacity-90">
          Issue
        </button>
      </form>
      <p v-if="orderError" class="ct-label mt-2 text-destructive">{{ orderError }}</p>
    </section>

    <!-- The Wire timeline -->
    <section class="ct-card border border-border bg-card p-5">
      <h2 class="ct-label mb-3 text-muted-foreground">Activity Log (hash-chained)</h2>
      <ul class="space-y-2">
        <li v-for="e in entries" :key="e.id" class="flex items-start gap-3 border-b border-border/50 pb-2 text-sm">
          <span class="ct-label w-36 shrink-0 text-muted-foreground">{{ fmt(e.createdAt) }}</span>
          <span class="ct-label w-32 shrink-0" :class="actorColor[e.actorType]">{{ e.actor }}</span>
          <div class="min-w-0">
            <span class="ct-label text-foreground">{{ e.event }}</span>
            <span v-if="e.missionKey" class="ct-label ml-1 text-accent">{{ e.missionKey }}</span>
            <span v-if="e.fromStatus || e.toStatus" class="ct-label ml-1 text-muted-foreground">{{ e.fromStatus }}→{{ e.toStatus }}</span>
            <p v-if="e.message" class="text-muted-foreground">{{ e.message }}</p>
          </div>
        </li>
        <li v-if="!entries?.length" class="text-sm text-muted-foreground">No activity yet.</li>
      </ul>
    </section>
  </div>
</template>
