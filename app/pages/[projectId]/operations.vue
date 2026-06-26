<script setup lang="ts">
import type { Operation } from '~/types'

const route = useRoute()
const orgs = useOrgStore()
const projectId = computed(() => route.params.projectId as string)
const isManager = computed(() => orgs.activeRole === 'manager')

const { data: operations, refresh } = await useAsyncData(
  'operations',
  () => useRequestFetch()<Operation[]>(`/api/v1/projects/${projectId.value}/operations`),
  { watch: [projectId] },
)

const codename = ref('')
const objective = ref('')
const activate = ref(false)
const error = ref('')

async function plan() {
  error.value = ''
  try {
    await $fetch(`/api/v1/projects/${projectId.value}/operations`, {
      method: 'POST',
      body: { codename: codename.value, objective: objective.value, activate: activate.value },
    })
    codename.value = ''
    objective.value = ''
    activate.value = false
    await refresh()
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Could not plan operation'
  }
}

async function close(op: Operation) {
  await $fetch(`/api/v1/operations/${op.id}/close`, { method: 'POST' })
  await refresh()
}

const statusColor: Record<string, string> = {
  active: 'text-accent',
  planned: 'text-accent-tertiary',
  completed: 'text-muted-foreground',
  archived: 'text-muted-foreground',
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8">
    <div class="flex items-center gap-3">
      <Icon name="lucide:target" class="size-7 text-accent" />
      <h1 class="ct-heading text-xl font-bold">Operations</h1>
    </div>

    <section v-if="isManager" class="ct-card border border-border bg-card p-5">
      <h2 class="ct-label mb-3 text-muted-foreground">Plan Operation</h2>
      <form class="space-y-3" @submit.prevent="plan">
        <input
          v-model="codename"
          required
          placeholder="Operation codename (e.g. Operation Daybreak)"
          class="w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <textarea
          v-model="objective"
          rows="2"
          placeholder="Objective"
          class="w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <div class="flex items-center justify-between">
          <label class="ct-label flex items-center gap-2 text-muted-foreground">
            <input v-model="activate" type="checkbox" /> activate immediately
          </label>
          <button
            type="submit"
            :disabled="!codename"
            class="ct-glow-sm rounded-[var(--radius-card)] bg-accent px-4 py-2 text-sm font-bold text-background hover:opacity-90 disabled:opacity-40"
          >
            Plan
          </button>
        </div>
        <p v-if="error" class="ct-label text-destructive">{{ error }}</p>
      </form>
    </section>

    <section class="ct-card border border-border bg-card p-5">
      <h2 class="ct-label mb-3 text-muted-foreground">Operations</h2>
      <ul class="space-y-3">
        <li
          v-for="op in operations"
          :key="op.id"
          class="border-b border-border/50 pb-3 last:border-0"
        >
          <div class="flex items-center justify-between">
            <div>
              <span class="ct-label text-accent">{{ op.key }}</span>
              <span class="ml-2 font-medium">{{ op.codename }}</span>
            </div>
            <div class="flex items-center gap-3">
              <span class="ct-label" :class="statusColor[op.status]">{{ op.status }}</span>
              <button
                v-if="isManager && op.status !== 'completed' && op.status !== 'archived'"
                class="ct-label text-muted-foreground hover:text-destructive"
                @click="close(op)"
              >
                close
              </button>
            </div>
          </div>
          <p v-if="op.objective" class="mt-1 text-sm text-muted-foreground">{{ op.objective }}</p>
        </li>
        <li v-if="!operations?.length" class="text-sm text-muted-foreground">No operations yet.</li>
      </ul>
    </section>
  </div>
</template>
