<script setup lang="ts">
import type { Sector } from '~/types'

const props = defineProps<{ open: boolean, orgId: string }>()
const emit = defineEmits<{ close: [], created: [projectId: string] }>()

const ALL_SECTORS: Sector[] = ['FRONTEND', 'BACKEND', 'QA', 'INFRA', 'SECURITY', 'DESIGN']

const key = ref('')
const name = ref('')
const description = ref('')
const theme = ref<'defcon-5' | 'cyberwar'>('defcon-5')
const sectors = ref<Sector[]>(['FRONTEND', 'BACKEND', 'QA', 'DESIGN'])
const error = ref('')
const loading = ref(false)

function toggleSector(s: Sector) {
  const i = sectors.value.indexOf(s)
  if (i >= 0) sectors.value.splice(i, 1)
  else sectors.value.push(s)
}

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const project = await $fetch<{ id: string }>(`/api/v1/organizations/${props.orgId}/projects`, {
      method: 'POST',
      body: { key: key.value, name: name.value, description: description.value, sectors: sectors.value, activeThemeKey: theme.value },
    })
    emit('created', project.id)
    key.value = ''; name.value = ''; description.value = ''
  }
  catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Could not create project'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" @click.self="emit('close')">
        <div class="ct-card w-full max-w-md border border-border bg-card p-6">
          <div class="mb-4 flex items-center gap-2">
            <Icon name="lucide:folder-plus" class="size-6 text-accent" />
            <h2 class="ct-heading text-lg font-bold">New Project</h2>
          </div>
          <form class="space-y-3" @submit.prevent="submit">
            <div class="flex gap-3">
              <div class="w-24">
                <label class="ct-label mb-1 block text-muted-foreground">Key</label>
                <input v-model="key" required placeholder="WEB" style="text-transform:uppercase"
                  class="w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none">
              </div>
              <div class="flex-1">
                <label class="ct-label mb-1 block text-muted-foreground">Name</label>
                <input v-model="name" required placeholder="Operation Website"
                  class="w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none">
              </div>
            </div>
            <div>
              <label class="ct-label mb-1 block text-muted-foreground">Description</label>
              <input v-model="description" placeholder="optional"
                class="w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none">
            </div>
            <div>
              <label class="ct-label mb-1 block text-muted-foreground">Default theme</label>
              <select v-model="theme" class="w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none">
                <option value="defcon-5">DEFCON 5</option>
                <option value="cyberwar">Cyberwar</option>
              </select>
            </div>
            <div>
              <label class="ct-label mb-2 block text-muted-foreground">Sectors</label>
              <div class="flex flex-wrap gap-2">
                <button v-for="s in ALL_SECTORS" :key="s" type="button"
                  class="ct-label rounded-[var(--radius-card)] border px-2.5 py-1 transition-colors"
                  :class="sectors.includes(s) ? 'border-accent bg-accent text-background' : 'border-border text-muted-foreground hover:text-accent'"
                  @click="toggleSector(s)">{{ s }}</button>
              </div>
            </div>
            <p v-if="error" class="ct-label text-destructive">{{ error }}</p>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" class="ct-label rounded-[var(--radius-card)] border border-border px-3 py-2 text-muted-foreground hover:text-accent" @click="emit('close')">Cancel</button>
              <button type="submit" :disabled="loading || !key || !name || !sectors.length"
                class="ct-glow-sm rounded-[var(--radius-card)] bg-accent px-4 py-2 text-sm font-bold text-background hover:opacity-90 disabled:opacity-40">
                {{ loading ? 'Creating…' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
