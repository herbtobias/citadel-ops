<script setup lang="ts">
const route = useRoute()
const ui = useUiStore()
const missions = useMissionsStore()

const projectId = computed(() => route.params.projectId as string)

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
    </div>
    <KanbanBoard :project-id="projectId" class="flex-1" />
  </div>
</template>
