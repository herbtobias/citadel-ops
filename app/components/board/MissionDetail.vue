<script setup lang="ts">
import type { Mission } from '~/types'

const props = defineProps<{ mission: Mission | null }>()
defineEmits<{ close: []; 'open-key': [key: string] }>()

interface Dossier {
  id: string
  title: string
  status: string
  sections: Record<string, any>
  affectedFiles: string[]
  coldRead: any
}
interface Entry {
  id: string
  event: string
  fromStatus: string | null
  toStatus: string | null
  message: string | null
  actor: string
  createdAt: string
}

const dossier = ref<Dossier | null>(null)
const activity = ref<Entry[]>([])

// Load dossier + activity timeline whenever a mission is opened.
watch(
  () => props.mission?.id,
  async (id) => {
    dossier.value = null
    activity.value = []
    if (!id) return
    const [d, a] = await Promise.all([
      $fetch<Dossier | null>(`/api/v1/missions/${id}/dossier`).catch(() => null),
      $fetch<Entry[]>(`/api/v1/missions/${id}/activity`).catch(() => []),
    ])
    dossier.value = d
    activity.value = a
  },
  { immediate: true },
)

const sectionLabels: Record<string, string> = {
  problem: 'Problem',
  background: 'Background',
  technicalPlan: 'Technical Plan',
  rejectedAlternatives: 'Rejected Alternatives',
  implementationSteps: 'Implementation Steps',
  acceptanceCriteria: 'Acceptance Criteria',
  risks: 'Risks',
  handoffNotes: 'Hand-off Notes',
  references: 'References',
}
function fmt(d: string) {
  return new Date(d).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="mission"
        class="fixed inset-0 z-[60] flex items-start justify-end bg-black/60"
        @click.self="$emit('close')"
      >
        <div
          class="ct-scanlines h-full w-full max-w-xl overflow-y-auto border-l border-border bg-card p-6"
        >
          <div class="mb-4 flex items-start justify-between">
            <div>
              <span class="ct-label text-accent"
                >{{ mission.key }} · {{ mission.sector }} · {{ mission.type }}</span
              >
              <h2 class="ct-heading mt-1 text-xl font-bold">{{ mission.title }}</h2>
            </div>
            <button class="text-muted-foreground hover:text-accent" @click="$emit('close')">
              <Icon name="lucide:x" class="size-5" />
            </button>
          </div>

          <section class="mb-5">
            <p class="ct-label mb-1 text-muted-foreground">Briefing</p>
            <p class="text-sm leading-relaxed">{{ mission.briefing }}</p>
          </section>

          <section v-if="mission.acceptanceCriteria.length" class="mb-5">
            <p class="ct-label mb-1 text-muted-foreground">Acceptance Criteria</p>
            <ul class="space-y-1 text-sm">
              <li
                v-for="(c, i) in mission.acceptanceCriteria"
                :key="i"
                class="flex items-center gap-2"
              >
                <Icon name="lucide:check-circle-2" class="size-4 text-accent" />{{ c }}
              </li>
            </ul>
          </section>

          <section v-if="mission.links.length" class="mb-5">
            <p class="ct-label mb-1 text-muted-foreground">References</p>
            <ul class="space-y-1 text-sm">
              <li
                v-for="(l, i) in mission.links"
                :key="i"
                class="flex items-center gap-2 text-muted-foreground"
              >
                <Icon name="lucide:link" class="size-4 text-accent-tertiary" />
                <span class="text-accent-tertiary">{{ l.linkType }}</span>
                <button
                  v-if="l.targetKind === 'mission'"
                  class="text-foreground underline-offset-2 hover:text-accent hover:underline"
                  @click="$emit('open-key', l.targetKey)"
                >
                  {{ l.targetKey }}
                </button>
                <span v-else>{{ l.targetKey }}</span>
              </li>
            </ul>
          </section>

          <section v-if="mission.artifacts.length" class="mb-5">
            <p class="ct-label mb-1 text-muted-foreground">Artifacts</p>
            <ul class="space-y-1 text-sm">
              <li v-for="a in mission.artifacts" :key="a.id" class="flex items-center gap-2">
                <Icon name="lucide:git-pull-request" class="size-4 text-accent" />{{ a.label }}
              </li>
            </ul>
          </section>

          <!-- Dossier (The Archive) -->
          <section v-if="dossier" class="mb-5">
            <p class="ct-label mb-1 text-muted-foreground">
              Dossier ·
              <span
                :class="
                  dossier.status === 'cold_read_passed'
                    ? 'text-accent'
                    : dossier.status === 'cold_read_failed'
                      ? 'text-destructive'
                      : 'text-accent-tertiary'
                "
                >{{ dossier.status }}</span
              >
            </p>
            <p class="mb-2 text-sm font-medium">{{ dossier.title }}</p>
            <div v-for="(val, key) in dossier.sections" :key="key" class="mb-2">
              <p class="ct-label text-muted-foreground">{{ sectionLabels[key] ?? key }}</p>
              <p v-if="typeof val === 'string'" class="text-sm leading-relaxed">{{ val }}</p>
              <p v-else class="text-sm leading-relaxed">
                {{ Array.isArray(val) ? val.join(', ') : val }}
              </p>
            </div>
            <div
              v-if="dossier.coldRead"
              class="mt-2 rounded-[var(--radius-card)] border border-border p-2"
            >
              <p class="ct-label text-muted-foreground">
                Cold Read:
                <span
                  :class="dossier.coldRead.verdict === 'pass' ? 'text-accent' : 'text-destructive'"
                  >{{ dossier.coldRead.verdict }}</span
                >
              </p>
              <p v-if="dossier.coldRead.comprehensionNotes" class="text-sm text-muted-foreground">
                {{ dossier.coldRead.comprehensionNotes }}
              </p>
            </div>
          </section>

          <!-- Activity timeline (The Wire) -->
          <section v-if="activity.length" class="mb-5">
            <p class="ct-label mb-1 text-muted-foreground">Activity</p>
            <ul class="space-y-1.5">
              <li v-for="e in activity" :key="e.id" class="flex gap-2 text-xs">
                <span class="ct-label shrink-0 text-muted-foreground">{{ fmt(e.createdAt) }}</span>
                <span>
                  <span class="text-accent-tertiary">{{ e.actor }}</span>
                  <span class="ml-1 text-foreground">{{ e.event }}</span>
                  <span v-if="e.message" class="ml-1 text-muted-foreground">— {{ e.message }}</span>
                </span>
              </li>
            </ul>
          </section>

          <div class="ct-label flex gap-4 border-t border-border pt-4 text-muted-foreground">
            <span
              >Status: <span class="text-foreground">{{ mission.status }}</span></span
            >
            <span
              >Priority: <span class="text-foreground">{{ mission.priority }}</span></span
            >
            <span v-if="mission.claimedByAlias"
              >Agent: <span class="text-accent">{{ mission.claimedByAlias }}</span></span
            >
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
