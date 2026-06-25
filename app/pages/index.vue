<script setup lang="ts">
// Projects are already loaded in app.vue; redirect to the first project's board.
const projects = useProjectsStore()
const ui = useUiStore()

const first = projects.projects[0]
if (first) {
  ui.setActiveProject(first.id)
  await navigateTo(`/${first.id}/board`)
}
</script>

<template>
  <div class="flex h-full items-center justify-center text-muted-foreground">
    <p v-if="!projects.projects.length" class="ct-label">No projects yet</p>
  </div>
</template>
