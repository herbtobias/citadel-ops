<script setup lang="ts">
import draggable from 'vuedraggable'
import type { Mission, MissionStatus } from '~/types'

const props = defineProps<{
  status: MissionStatus
  missions: Mission[]
}>()

const emit = defineEmits<{
  open: [mission: Mission]
  move: [id: string, status: MissionStatus]
}>()

const missions = useMissionsStore()

// vuedraggable needs a writable list; derive from store + handle drops.
const localList = computed({
  get: () => props.missions,
  set: () => {},
})

function onAdd(evt: { item: { __draggable_context?: { element: Mission } } }) {
  const el = evt.item.__draggable_context?.element
  if (el) emit('move', el.id, props.status)
}

const label = computed(() => props.status.replace('_', ' '))
</script>

<template>
  <div class="flex w-72 shrink-0 flex-col">
    <div class="mb-2 flex items-center justify-between px-1">
      <span class="ct-label text-foreground">{{ label }}</span>
      <span class="ct-label rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{{ missions.length }}</span>
    </div>

    <draggable
      :list="localList"
      :group="{ name: 'missions', pull: true, put: true }"
      item-key="id"
      class="flex min-h-24 flex-1 flex-col gap-2 rounded-[var(--radius-card)] bg-muted/30 p-2"
      ghost-class="opacity-40"
      drag-class="task-dragging"
      @add="onAdd"
    >
      <template #item="{ element }">
        <MissionCard :mission="element" @open="emit('open', element)" />
      </template>
    </draggable>
  </div>
</template>
