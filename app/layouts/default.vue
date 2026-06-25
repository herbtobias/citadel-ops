<script setup lang="ts">
const route = useRoute()
const projects = useProjectsStore()

// Active project's operations power the topbar subtitle; load before the shell
// renders (payload-transferred) so the topbar is identical SSR & client.
const pid = computed(() => route.params.projectId as string | undefined)
await useAsyncData(
  'shell-operations',
  () => (pid.value ? projects.fetchOperations(pid.value) : Promise.resolve([])),
  { watch: [pid] },
)
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-background text-foreground ct-grid-bg">
    <AppSidebar />
    <div class="flex flex-1 flex-col overflow-hidden">
      <AppTopbar />
      <main class="flex-1 overflow-y-auto p-6">
        <slot />
      </main>
    </div>
    <AppToaster />
  </div>
</template>
