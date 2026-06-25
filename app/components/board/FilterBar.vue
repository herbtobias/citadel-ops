<script setup lang="ts">
// P0: visual scaffold. Wired to real filtering in P7.
const ui = useUiStore()
const projects = useProjectsStore()
const project = computed(() => projects.byId(ui.activeProjectId))
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <span class="ct-label text-muted-foreground">Filter:</span>
    <button
      v-for="s in project?.sectors ?? []"
      :key="s"
      class="ct-label rounded-[var(--radius-card)] border border-border px-2 py-1 text-muted-foreground transition-colors hover:border-accent hover:text-accent"
    >
      {{ s }}
    </button>
    <div class="ml-auto flex items-center gap-1 text-muted-foreground">
      <Icon name="lucide:filter" class="size-4" />
      <span class="ct-label">Sector · Agent · Type · Priority</span>
    </div>
  </div>
</template>
