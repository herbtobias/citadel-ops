<script setup lang="ts">
import type { Mission, Operation, Sector, MissionType, Priority } from '~/types'

const props = defineProps<{ open: boolean; projectId: string; sectors: Sector[] }>()
const emit = defineEmits<{ close: []; created: [mission: Mission] }>()

const missions = useMissionsStore()

const TYPES: MissionType[] = ['feature', 'bugfix', 'test', 'design', 'spike', 'chore', 'research']
const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']

const title = ref('')
const sector = ref<Sector | ''>('')
const type = ref<MissionType>('feature')
const priority = ref<Priority>('medium')
const objective = ref('')
const briefing = ref('')
const estimate = ref<number | null>(null)
const acceptance = ref('') // one criterion per line
const operationId = ref<string>('')
const error = ref('')
const loading = ref(false)

// Operations to optionally attach to — loaded when the modal opens.
const operations = ref<Operation[]>([])
watch(
  () => props.open,
  async (open) => {
    if (!open) return
    sector.value = props.sectors[0] ?? ''
    try {
      operations.value = await $fetch<Operation[]>(`/api/v1/projects/${props.projectId}/operations`)
    } catch {
      operations.value = []
    }
  },
)

function reset() {
  title.value = ''
  objective.value = ''
  briefing.value = ''
  estimate.value = null
  acceptance.value = ''
  operationId.value = ''
  type.value = 'feature'
  priority.value = 'medium'
}

async function submit() {
  if (!sector.value) {
    error.value = 'Pick a sector'
    return
  }
  error.value = ''
  loading.value = true
  try {
    const created = await missions.createMission(props.projectId, {
      title: title.value,
      sector: sector.value,
      type: type.value,
      priority: priority.value,
      objective: objective.value,
      briefing: briefing.value,
      estimatePoints: estimate.value || undefined,
      acceptanceCriteria: acceptance.value
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      operationId: operationId.value || undefined,
    })
    emit('created', created)
    reset()
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Could not create mission'
  } finally {
    loading.value = false
  }
}

const inputCls =
  'w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none'
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
        @click.self="emit('close')"
      >
        <div
          class="ct-card max-h-[90vh] w-full max-w-lg overflow-y-auto border border-border bg-card p-6"
        >
          <div class="mb-4 flex items-center gap-2">
            <Icon name="lucide:file-plus-2" class="size-6 text-accent" />
            <h2 class="ct-heading text-lg font-bold">New Mission</h2>
          </div>
          <form class="space-y-3" @submit.prevent="submit">
            <div>
              <label class="ct-label mb-1 block text-muted-foreground">Title</label>
              <input v-model="title" required placeholder="Add OAuth login" :class="inputCls" />
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="ct-label mb-1 block text-muted-foreground">Sector</label>
                <select v-model="sector" required :class="inputCls">
                  <option v-for="s in sectors" :key="s" :value="s">{{ s }}</option>
                </select>
              </div>
              <div>
                <label class="ct-label mb-1 block text-muted-foreground">Type</label>
                <select v-model="type" :class="inputCls">
                  <option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <div>
                <label class="ct-label mb-1 block text-muted-foreground">Priority</label>
                <select v-model="priority" :class="inputCls">
                  <option v-for="p in PRIORITIES" :key="p" :value="p">{{ p }}</option>
                </select>
              </div>
            </div>

            <div>
              <label class="ct-label mb-1 block text-muted-foreground">Objective</label>
              <textarea
                v-model="objective"
                rows="2"
                placeholder="What outcome does this mission achieve?"
                :class="inputCls"
              />
            </div>

            <div>
              <label class="ct-label mb-1 block text-muted-foreground">Briefing (optional)</label>
              <textarea
                v-model="briefing"
                rows="3"
                placeholder="Context, constraints, links the agent needs"
                :class="inputCls"
              />
            </div>

            <div>
              <label class="ct-label mb-1 block text-muted-foreground">
                Acceptance criteria (one per line)
              </label>
              <textarea
                v-model="acceptance"
                rows="2"
                placeholder="Login persists across reload&#10;Errors are shown inline"
                :class="inputCls"
              />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="ct-label mb-1 block text-muted-foreground">Estimate (points)</label>
                <input
                  v-model.number="estimate"
                  type="number"
                  min="1"
                  placeholder="—"
                  :class="inputCls"
                />
              </div>
              <div>
                <label class="ct-label mb-1 block text-muted-foreground">Operation</label>
                <select v-model="operationId" :class="inputCls">
                  <option value="">— none —</option>
                  <option v-for="o in operations" :key="o.id" :value="o.id">
                    {{ o.key }} · {{ o.codename }}
                  </option>
                </select>
              </div>
            </div>

            <p class="ct-label text-muted-foreground">
              Lands in <span class="text-accent">backlog</span> — groom it to
              <span class="text-accent">ready</span> on the board to make it claimable.
            </p>
            <p v-if="error" class="ct-label text-destructive">{{ error }}</p>

            <div class="flex justify-end gap-2 pt-2">
              <button
                type="button"
                class="ct-label rounded-[var(--radius-card)] border border-border px-3 py-2 text-muted-foreground hover:text-accent"
                @click="emit('close')"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="loading || !title || !sector"
                class="ct-glow-sm rounded-[var(--radius-card)] bg-accent px-4 py-2 text-sm font-bold text-background hover:opacity-90 disabled:opacity-40"
              >
                {{ loading ? 'Creating…' : 'Create mission' }}
              </button>
            </div>
          </form>
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
