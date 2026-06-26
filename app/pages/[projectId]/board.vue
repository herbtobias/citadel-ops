<script setup lang="ts">
const route = useRoute()
const ui = useUiStore()
const missions = useMissionsStore()
const projects = useProjectsStore()
const orgs = useOrgStore()

const projectId = computed(() => route.params.projectId as string)

// Managers & contributors plan work; viewers are read-only.
const canPlan = computed(() => orgs.activeRole === 'manager' || orgs.activeRole === 'contributor')
const projectSectors = computed(() => projects.byId(projectId.value)?.sectors ?? [])
const showNew = ref(false)

async function onCreated() {
  showNew.value = false
  await missions.fetchMissions(projectId.value)
}

// Keep the UI store's active project in sync (used by the sidebar select & theme).
watchEffect(() => {
  if (projectId.value) ui.setActiveProject(projectId.value)
})

// Payload-transferred on first load; refetches on project switch (watch).
await useAsyncData('board-missions', () => missions.fetchMissions(projectId.value), {
  watch: [projectId],
})

// Live board: any mission event (claimed / transitioned / completed / …) re-pulls
// the missions so cards move on their own — debounced to coalesce bursts. §13.
let liveTimer: any = null
useProjectEvents(projectId, () => {
  clearTimeout(liveTimer)
  liveTimer = setTimeout(() => missions.fetchMissions(projectId.value), 300)
})
onBeforeUnmount(() => clearTimeout(liveTimer))
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="flex items-center gap-3">
      <FilterBar class="min-w-0 flex-1" />
      <span
        class="ct-label flex shrink-0 items-center gap-1.5 text-muted-foreground"
        title="Board updates live as agents work"
      >
        <span class="size-2 rounded-full bg-accent ct-glow-sm" /> live
      </span>
      <button
        v-if="canPlan"
        class="ct-glow-sm flex shrink-0 items-center gap-1.5 rounded-[var(--radius-card)] bg-accent px-3 py-1.5 text-sm font-bold text-background hover:opacity-90"
        @click="showNew = true"
      >
        <Icon name="lucide:plus" class="size-4" /> New Mission
      </button>
    </div>
    <KanbanBoard :project-id="projectId" class="flex-1" />
    <NewMissionModal
      :open="showNew"
      :project-id="projectId"
      :sectors="projectSectors"
      @close="showNew = false"
      @created="onCreated"
    />
  </div>
</template>
