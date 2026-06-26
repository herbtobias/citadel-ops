<script setup lang="ts">
defineProps<{ icon: string; title: string; phase: string; blurb: string }>()
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center text-center">
    <div class="ct-card ct-chamfer flex max-w-md flex-col items-center gap-3 p-10">
      <Icon :name="icon" class="size-10 text-accent ct-glow-sm" />
      <h2 class="ct-heading text-xl font-bold">{{ title }}</h2>
      <span class="ct-label rounded bg-muted px-2 py-1 text-muted-foreground">{{ phase }}</span>
      <p class="text-sm text-muted-foreground">{{ blurb }}</p>
    </div>
  </div>
</template>
