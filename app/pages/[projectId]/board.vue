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
await useAsyncData(
  'board-missions',
  () => missions.fetchMissions(projectId.value),
  { watch: [projectId] },
)
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <FilterBar />
    <KanbanBoard :project-id="projectId" class="flex-1" />
  </div>
</template>
