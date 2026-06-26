<script setup lang="ts">
import type { Sector } from '~/types'

const route = useRoute()
const projects = useProjectsStore()
const orgs = useOrgStore()

const projectId = computed(() => route.params.projectId as string)
const project = computed(() => projects.byId(projectId.value))
const isManager = computed(() => orgs.activeRole === 'manager')

interface License {
  id: string
  agentAlias: string
  sectors: string[]
  status: string
  lastSeenAt: string | null
  expiresAt: string | null
}

const { data: licenses, refresh } = await useAsyncData(
  'm-desk-licenses',
  () => useRequestFetch()<License[]>(`/api/v1/projects/${projectId.value}/licenses`),
  { watch: [projectId] },
)

// Issue form
const alias = ref('')
const chosenSectors = ref<Sector[]>([])
const issueError = ref('')
const issuedKey = ref<string | null>(null)

function toggleSector(s: Sector) {
  const i = chosenSectors.value.indexOf(s)
  if (i >= 0) chosenSectors.value.splice(i, 1)
  else chosenSectors.value.push(s)
}

async function issue() {
  issueError.value = ''
  issuedKey.value = null
  try {
    const res = await $fetch<{ key: string }>(`/api/v1/projects/${projectId.value}/licenses`, {
      method: 'POST',
      body: { agentAlias: alias.value, sectors: chosenSectors.value },
    })
    issuedKey.value = res.key
    alias.value = ''
    chosenSectors.value = []
    await refresh()
  } catch (e: any) {
    issueError.value = e?.data?.statusMessage || e?.statusMessage || 'Could not issue license'
  }
}

async function revoke(id: string) {
  await $fetch(`/api/v1/licenses/${id}`, { method: 'DELETE' })
  await refresh()
}

// Locale-independent so SSR and client render identically (no hydration mismatch).
function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8">
    <div class="flex items-center gap-3">
      <Icon name="lucide:id-card" class="size-7 text-accent" />
      <h1 class="ct-heading text-xl font-bold">The M Desk</h1>
    </div>

    <p
      v-if="!isManager"
      class="ct-card border border-border bg-card p-4 text-sm text-muted-foreground"
    >
      Only managers can issue or revoke licenses. Showing the agent roster (read-only).
    </p>

    <!-- Issue -->
    <section v-if="isManager" class="ct-card border border-border bg-card p-5">
      <h2 class="ct-label mb-3 text-muted-foreground">Issue license</h2>
      <form class="space-y-4" @submit.prevent="issue">
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex-1 min-w-[160px]">
            <label class="ct-label mb-1 block text-muted-foreground">Agent alias</label>
            <input
              v-model="alias"
              required
              placeholder="008"
              class="w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="submit"
            :disabled="!alias || !chosenSectors.length"
            class="ct-glow-sm rounded-[var(--radius-card)] bg-accent px-4 py-2 text-sm font-bold text-background hover:opacity-90 disabled:opacity-40"
          >
            Issue
          </button>
        </div>
        <div>
          <label class="ct-label mb-2 block text-muted-foreground">Sectors</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="s in project?.sectors ?? []"
              :key="s"
              type="button"
              class="ct-label rounded-[var(--radius-card)] border px-3 py-1.5 transition-colors"
              :class="
                chosenSectors.includes(s)
                  ? 'border-accent bg-accent text-background'
                  : 'border-border text-muted-foreground hover:text-accent'
              "
              @click="toggleSector(s)"
            >
              {{ s }}
            </button>
          </div>
        </div>
        <p v-if="issueError" class="ct-label text-destructive">{{ issueError }}</p>
      </form>

      <div
        v-if="issuedKey"
        class="mt-4 rounded-[var(--radius-card)] border border-accent bg-background p-3"
      >
        <p class="ct-label mb-1 text-accent">License key — shown once, copy it now</p>
        <code class="block break-all text-sm text-foreground">{{ issuedKey }}</code>
      </div>
    </section>

    <!-- Roster -->
    <section class="ct-card border border-border bg-card p-5">
      <h2 class="ct-label mb-3 text-muted-foreground">Agent roster</h2>
      <table class="w-full text-sm">
        <thead>
          <tr class="ct-label border-b border-border text-left text-muted-foreground">
            <th class="py-2">Alias</th>
            <th>Sectors</th>
            <th>Status</th>
            <th>Last seen</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in licenses" :key="l.id" class="border-b border-border/50">
            <td class="py-2 font-bold">{{ l.agentAlias }}</td>
            <td class="text-muted-foreground">{{ l.sectors.join(', ') }}</td>
            <td>
              <span :class="l.status === 'active' ? 'text-accent' : 'text-destructive'">{{
                l.status
              }}</span>
            </td>
            <td class="text-muted-foreground">{{ fmt(l.lastSeenAt) }}</td>
            <td class="text-right">
              <button
                v-if="isManager && l.status === 'active'"
                class="ct-label text-destructive hover:underline"
                title="Kill-switch"
                @click="revoke(l.id)"
              >
                Revoke
              </button>
            </td>
          </tr>
          <tr v-if="!licenses?.length">
            <td colspan="5" class="py-4 text-center text-muted-foreground">
              No licenses issued yet.
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
