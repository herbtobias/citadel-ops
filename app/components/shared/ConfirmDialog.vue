<script setup lang="ts">
// A small confirm modal (Teleport + fade), used for irreversible or in-force-affecting
// actions like deactivating a Quality Gate. Mirrors the board modal pattern.
defineProps<{
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
        @click.self="emit('cancel')"
      >
        <div class="ct-card w-full max-w-sm border border-border bg-card p-6">
          <div class="mb-3 flex items-center gap-2">
            <Icon
              :name="danger ? 'lucide:triangle-alert' : 'lucide:help-circle'"
              class="size-6"
              :class="danger ? 'text-destructive' : 'text-accent'"
            />
            <h2 class="ct-heading text-base font-bold">{{ title }}</h2>
          </div>
          <p class="text-sm leading-relaxed text-muted-foreground">{{ message }}</p>
          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              class="ct-label rounded-[var(--radius-card)] border border-border px-3 py-2 text-muted-foreground hover:text-accent"
              @click="emit('cancel')"
            >
              Cancel
            </button>
            <button
              type="button"
              class="ct-label rounded-[var(--radius-card)] px-4 py-2 font-bold text-background hover:opacity-90"
              :class="danger ? 'bg-destructive' : 'ct-glow-sm bg-accent'"
              @click="emit('confirm')"
            >
              {{ confirmLabel ?? 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
