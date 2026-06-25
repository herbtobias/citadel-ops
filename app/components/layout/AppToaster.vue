<script setup lang="ts">
const { toasts, dismiss } = useToasts()

const toneIcon: Record<string, string> = {
  info: 'lucide:info',
  accent: 'lucide:bell-ring',
  destructive: 'lucide:triangle-alert',
}
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-80 flex-col gap-2">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="ct-card pointer-events-auto flex items-start gap-3 border bg-card p-3 shadow-xl"
          :class="t.tone === 'destructive' ? 'border-destructive' : t.tone === 'accent' ? 'border-accent' : 'border-border'"
          @click="dismiss(t.id)"
        >
          <Icon
            :name="toneIcon[t.tone]" class="mt-0.5 size-5 shrink-0"
            :class="t.tone === 'destructive' ? 'text-destructive' : 'text-accent'"
          />
          <div class="min-w-0 flex-1">
            <p class="ct-label font-bold text-foreground">{{ t.title }}</p>
            <p v-if="t.body" class="mt-0.5 truncate text-sm text-muted-foreground">{{ t.body }}</p>
          </div>
          <Icon name="lucide:x" class="mt-0.5 size-4 shrink-0 text-muted-foreground hover:text-foreground" />
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active, .toast-leave-active { transition: all 0.25s cubic-bezier(0.25, 0, 0, 1); }
.toast-enter-from { opacity: 0; transform: translateX(1rem); }
.toast-leave-to { opacity: 0; transform: translateX(1rem); }
.toast-move { transition: transform 0.25s; }
</style>
