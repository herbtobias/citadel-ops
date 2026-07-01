<script setup lang="ts">
const route = useRoute()
const orgs = useOrgStore()
const projectId = computed(() => route.params.projectId as string)
const isManager = computed(() => orgs.activeRole === 'manager')

type QStatus = 'pending' | 'active' | 'inactive'
interface Gate {
  id: string
  key: string
  name: string
  appliesToStatus: string
  rule: Record<string, boolean>
  blocking: boolean
  status: QStatus
  proposed: boolean
}
interface Harness {
  id: string
  key: string
  name: string
  commands: Record<string, string>
  notes: string | null
  status: QStatus
}
interface GuidelineRow {
  id: string
  themeKey: string
  title: string
  bodyMarkdown: string
  status: QStatus
}
interface Design {
  activeThemeKey: string
  guideline: { title: string; bodyMarkdown: string } | null
  guidelines: GuidelineRow[]
  themes: { key: string; name: string }[]
}

const { data, refresh } = await useAsyncData(
  'q-branch',
  async () => {
    const f = useRequestFetch()
    const [gates, harness, design] = await Promise.all([
      f<Gate[]>(`/api/v1/projects/${projectId.value}/quality-gates`),
      f<Harness[]>(`/api/v1/projects/${projectId.value}/harness`),
      f<Design>(`/api/v1/projects/${projectId.value}/design-guidelines?theme=active`),
    ])
    return { gates, harness, design }
  },
  { watch: [projectId] },
)

const STATUSES = [
  'backlog',
  'designing',
  'cold_read',
  'ready',
  'in_progress',
  'in_review',
  'blocked',
  'done',
]
const RULES = [
  'requireColdRead',
  'requireArtifacts',
  'requireHarnessPass',
  'requireAcceptanceChecked',
] as const

function ruleList(rule: Record<string, boolean>) {
  return Object.entries(rule)
    .filter(([, v]) => v)
    .map(([k]) => k)
}
const statusClass: Record<QStatus, string> = {
  pending: 'text-accent-secondary',
  active: 'text-accent',
  inactive: 'text-muted-foreground',
}

const inputCls =
  'w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none'

// ── Mutations ──
const busy = ref<Record<string, boolean>>({})
async function run(id: string, fn: () => Promise<unknown>) {
  busy.value[id] = true
  try {
    await fn()
    await refresh()
  } finally {
    busy.value[id] = false
  }
}
const patch = (path: string, body: Record<string, unknown>) =>
  $fetch(path, { method: 'PATCH', body })
const del = (path: string) => $fetch(path, { method: 'DELETE' })

function setGate(g: Gate, status: QStatus) {
  return run(g.id, () => patch(`/api/v1/quality-gates/${g.id}`, { status }))
}
function setHarness(h: Harness, status: QStatus) {
  return run(h.id, () => patch(`/api/v1/harness/${h.id}`, { status }))
}
function setGuideline(g: GuidelineRow, status: QStatus) {
  return run(g.id, () => patch(`/api/v1/design-guidelines/${g.id}`, { status }))
}
function removeGate(g: Gate) {
  return run(g.id, () => del(`/api/v1/quality-gates/${g.id}`))
}
function removeHarness(h: Harness) {
  return run(h.id, () => del(`/api/v1/harness/${h.id}`))
}
function removeGuideline(g: GuidelineRow) {
  return run(g.id, () => del(`/api/v1/design-guidelines/${g.id}`))
}

// ── Deactivation confirmation ──
const confirmState = ref<{ label: string; act: () => Promise<unknown> } | null>(null)
function askDeactivate(label: string, act: () => Promise<unknown>) {
  confirmState.value = { label, act }
}
async function onConfirm() {
  const s = confirmState.value
  confirmState.value = null
  if (s) await s.act()
}

// ── Create forms ──
const showNewGate = ref(false)
const gForm = reactive({
  key: '',
  name: '',
  appliesToStatus: 'ready',
  rule: {
    requireColdRead: false,
    requireArtifacts: false,
    requireHarnessPass: false,
    requireAcceptanceChecked: false,
  } as Record<string, boolean>,
  blocking: true,
  error: '',
  loading: false,
})
async function createGate() {
  gForm.error = ''
  gForm.loading = true
  try {
    const rule = Object.fromEntries(Object.entries(gForm.rule).filter(([, v]) => v))
    await $fetch(`/api/v1/projects/${projectId.value}/quality-gates`, {
      method: 'POST',
      body: {
        key: gForm.key,
        name: gForm.name,
        appliesToStatus: gForm.appliesToStatus,
        rule,
        blocking: gForm.blocking,
      },
    })
    Object.assign(gForm, {
      key: '',
      name: '',
      appliesToStatus: 'ready',
      rule: {
        requireColdRead: false,
        requireArtifacts: false,
        requireHarnessPass: false,
        requireAcceptanceChecked: false,
      },
      blocking: true,
    })
    showNewGate.value = false
    await refresh()
  } catch (e: any) {
    gForm.error = e?.data?.statusMessage || e?.statusMessage || 'Could not create gate'
  } finally {
    gForm.loading = false
  }
}

const showNewHarness = ref(false)
const hForm = reactive({
  key: '',
  name: '',
  build: '',
  test: '',
  lint: '',
  run: '',
  error: '',
  loading: false,
})
async function createHarness() {
  hForm.error = ''
  hForm.loading = true
  try {
    const commands = Object.fromEntries(
      (['build', 'test', 'lint', 'run'] as const)
        .map((k) => [k, (hForm as any)[k].trim()])
        .filter(([, v]) => v),
    )
    await $fetch(`/api/v1/projects/${projectId.value}/harness`, {
      method: 'POST',
      body: { key: hForm.key, name: hForm.name, commands },
    })
    Object.assign(hForm, { key: '', name: '', build: '', test: '', lint: '', run: '' })
    showNewHarness.value = false
    await refresh()
  } catch (e: any) {
    hForm.error = e?.data?.statusMessage || e?.statusMessage || 'Could not create harness'
  } finally {
    hForm.loading = false
  }
}

const showNewGuideline = ref(false)
const dForm = reactive({ themeKey: '', title: '', bodyMarkdown: '', error: '', loading: false })
async function createGuideline() {
  dForm.error = ''
  dForm.loading = true
  try {
    await $fetch(`/api/v1/projects/${projectId.value}/design-guidelines`, {
      method: 'POST',
      body: { themeKey: dForm.themeKey, title: dForm.title, bodyMarkdown: dForm.bodyMarkdown },
    })
    Object.assign(dForm, { themeKey: '', title: '', bodyMarkdown: '' })
    showNewGuideline.value = false
    await refresh()
  } catch (e: any) {
    dForm.error = e?.data?.statusMessage || e?.statusMessage || 'Could not create guideline'
  } finally {
    dForm.loading = false
  }
}

const btnCls =
  'ct-label rounded-[var(--radius-card)] border border-border px-2 py-1 hover:border-accent disabled:opacity-40'
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8">
    <div class="flex items-center gap-3">
      <Icon name="lucide:flask-conical" class="size-7 text-accent" />
      <h1 class="ct-heading text-xl font-bold">Q-Branch</h1>
    </div>
    <p class="ct-label text-muted-foreground">
      The Quartermaster's equipment — Quality Gates, Harness Definitions and Design Guidelines.
      <template v-if="isManager"
        >Planner-proposed gates land <span class="text-accent-secondary">pending</span> until you
        activate them; only <span class="text-accent">active</span> equipment is enforced.</template
      >
      <template v-else>Only managers can author or activate equipment.</template>
    </p>

    <!-- Quality Gates -->
    <section class="ct-card border border-border bg-card p-5">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="ct-label text-muted-foreground">Quality Gates</h2>
        <button
          v-if="isManager"
          class="ct-label text-accent hover:underline"
          @click="showNewGate = !showNewGate"
        >
          {{ showNewGate ? 'Cancel' : '+ New gate' }}
        </button>
      </div>

      <form
        v-if="isManager && showNewGate"
        class="mb-4 space-y-3 rounded-[var(--radius-card)] border border-border bg-background p-4"
        @submit.prevent="createGate"
      >
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="ct-label mb-1 block text-muted-foreground">Key</label>
            <input v-model="gForm.key" required placeholder="review-gate" :class="inputCls" />
          </div>
          <div>
            <label class="ct-label mb-1 block text-muted-foreground">Name</label>
            <input
              v-model="gForm.name"
              required
              placeholder="Artifacts before review"
              :class="inputCls"
            />
          </div>
        </div>
        <div>
          <label class="ct-label mb-1 block text-muted-foreground">Applies to status</label>
          <select v-model="gForm.appliesToStatus" :class="inputCls">
            <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div>
          <label class="ct-label mb-2 block text-muted-foreground">Rules</label>
          <div class="flex flex-wrap gap-x-4 gap-y-1.5">
            <label
              v-for="r in RULES"
              :key="r"
              class="ct-label flex items-center gap-2 text-muted-foreground"
            >
              <input v-model="gForm.rule[r]" type="checkbox" />
              {{ r }}
            </label>
          </div>
        </div>
        <label class="ct-label flex items-center gap-2 text-muted-foreground">
          <input v-model="gForm.blocking" type="checkbox" />
          Blocking — an unmet rule blocks the transition (uncheck for advisory)
        </label>
        <p v-if="gForm.error" class="ct-label text-destructive">{{ gForm.error }}</p>
        <button
          type="submit"
          :disabled="gForm.loading || !gForm.key || !gForm.name"
          class="ct-glow-sm rounded-[var(--radius-card)] bg-accent px-4 py-2 text-sm font-bold text-background hover:opacity-90 disabled:opacity-40"
        >
          {{ gForm.loading ? 'Creating…' : 'Create gate (active)' }}
        </button>
      </form>

      <ul class="space-y-3">
        <li
          v-for="g in data?.gates"
          :key="g.id"
          class="border-b border-border/50 pb-3 last:border-0"
        >
          <div class="flex items-center justify-between gap-2">
            <span
              class="font-medium"
              :class="{ 'text-muted-foreground line-through': g.status === 'inactive' }"
            >
              {{ g.name }}
            </span>
            <div class="flex shrink-0 items-center gap-2">
              <span class="ct-label" :class="statusClass[g.status]">{{ g.status }}</span>
              <span class="ct-label rounded bg-muted px-1.5 py-0.5 text-accent-tertiary"
                >@ {{ g.appliesToStatus }}</span
              >
            </div>
          </div>
          <div class="mt-1 flex flex-wrap gap-1">
            <span
              v-for="r in ruleList(g.rule)"
              :key="r"
              class="ct-label rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
              >{{ r }}</span
            >
            <span v-if="g.blocking" class="ct-label rounded bg-muted px-1.5 py-0.5 text-destructive"
              >blocking</span
            >
            <span
              v-if="g.proposed"
              class="ct-label rounded bg-muted px-1.5 py-0.5 text-accent-secondary"
              >proposed by agent</span
            >
          </div>
          <div v-if="isManager" class="mt-2 flex gap-2">
            <button
              v-if="g.status === 'pending' || g.status === 'inactive'"
              :class="btnCls"
              :disabled="busy[g.id]"
              @click="setGate(g, 'active')"
            >
              {{ g.status === 'pending' ? 'Activate' : 'Reactivate' }}
            </button>
            <button
              v-if="g.status === 'active'"
              :class="btnCls"
              :disabled="busy[g.id]"
              @click="askDeactivate(`gate “${g.name}”`, () => setGate(g, 'inactive'))"
            >
              Deactivate
            </button>
            <button
              :class="btnCls"
              class="!hover:border-destructive text-destructive"
              :disabled="busy[g.id]"
              @click="removeGate(g)"
            >
              {{ g.status === 'pending' ? 'Dismiss' : 'Delete' }}
            </button>
          </div>
        </li>
        <li v-if="!data?.gates?.length" class="text-sm text-muted-foreground">
          No gates configured.
        </li>
      </ul>
    </section>

    <!-- Harness -->
    <section class="ct-card border border-border bg-card p-5">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="ct-label text-muted-foreground">Harness Definitions</h2>
        <button
          v-if="isManager"
          class="ct-label text-accent hover:underline"
          @click="showNewHarness = !showNewHarness"
        >
          {{ showNewHarness ? 'Cancel' : '+ New harness' }}
        </button>
      </div>

      <form
        v-if="isManager && showNewHarness"
        class="mb-4 space-y-3 rounded-[var(--radius-card)] border border-border bg-background p-4"
        @submit.prevent="createHarness"
      >
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="ct-label mb-1 block text-muted-foreground">Key</label>
            <input v-model="hForm.key" required placeholder="default" :class="inputCls" />
          </div>
          <div>
            <label class="ct-label mb-1 block text-muted-foreground">Name</label>
            <input v-model="hForm.name" required placeholder="Default harness" :class="inputCls" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="ct-label mb-1 block text-muted-foreground">build</label>
            <input v-model="hForm.build" placeholder="npm run build" :class="inputCls" />
          </div>
          <div>
            <label class="ct-label mb-1 block text-muted-foreground">test</label>
            <input v-model="hForm.test" placeholder="npm run test" :class="inputCls" />
          </div>
          <div>
            <label class="ct-label mb-1 block text-muted-foreground">lint</label>
            <input v-model="hForm.lint" placeholder="npm run lint" :class="inputCls" />
          </div>
          <div>
            <label class="ct-label mb-1 block text-muted-foreground">run</label>
            <input v-model="hForm.run" placeholder="npm run dev" :class="inputCls" />
          </div>
        </div>
        <p v-if="hForm.error" class="ct-label text-destructive">{{ hForm.error }}</p>
        <button
          type="submit"
          :disabled="hForm.loading || !hForm.key || !hForm.name"
          class="ct-glow-sm rounded-[var(--radius-card)] bg-accent px-4 py-2 text-sm font-bold text-background hover:opacity-90 disabled:opacity-40"
        >
          {{ hForm.loading ? 'Creating…' : 'Create harness (active)' }}
        </button>
      </form>

      <div
        v-for="h in data?.harness"
        :key="h.id"
        class="border-b border-border/50 pb-3 last:border-0"
      >
        <div class="flex items-center justify-between">
          <p
            class="font-medium"
            :class="{ 'text-muted-foreground line-through': h.status === 'inactive' }"
          >
            {{ h.name }}
          </p>
          <span class="ct-label" :class="statusClass[h.status]">{{ h.status }}</span>
        </div>
        <ul class="mt-1 space-y-1 text-sm">
          <li v-for="(cmd, k) in h.commands" :key="k" class="flex gap-2">
            <span class="ct-label w-16 text-muted-foreground">{{ k }}</span>
            <code class="text-accent">{{ cmd }}</code>
          </li>
        </ul>
        <div v-if="isManager" class="mt-2 flex gap-2">
          <button
            v-if="h.status === 'inactive'"
            :class="btnCls"
            :disabled="busy[h.id]"
            @click="setHarness(h, 'active')"
          >
            Reactivate
          </button>
          <button
            v-else
            :class="btnCls"
            :disabled="busy[h.id]"
            @click="askDeactivate(`harness “${h.name}”`, () => setHarness(h, 'inactive'))"
          >
            Deactivate
          </button>
          <button
            :class="btnCls"
            class="text-destructive"
            :disabled="busy[h.id]"
            @click="removeHarness(h)"
          >
            Delete
          </button>
        </div>
      </div>
      <p v-if="!data?.harness?.length" class="text-sm text-muted-foreground">
        No harness configured.
      </p>
    </section>

    <!-- Design Guidelines + Theme registry -->
    <section class="ct-card border border-border bg-card p-5">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="ct-label text-muted-foreground">Design Guidelines</h2>
        <div class="flex items-center gap-3">
          <span class="ct-label text-accent">active: {{ data?.design?.activeThemeKey }}</span>
          <button
            v-if="isManager"
            class="ct-label text-accent hover:underline"
            @click="showNewGuideline = !showNewGuideline"
          >
            {{ showNewGuideline ? 'Cancel' : '+ New guideline' }}
          </button>
        </div>
      </div>

      <form
        v-if="isManager && showNewGuideline"
        class="mb-4 space-y-3 rounded-[var(--radius-card)] border border-border bg-background p-4"
        @submit.prevent="createGuideline"
      >
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="ct-label mb-1 block text-muted-foreground">Theme</label>
            <select v-model="dForm.themeKey" required :class="inputCls">
              <option value="" disabled>— pick a theme —</option>
              <option v-for="t in data?.design?.themes" :key="t.key" :value="t.key">
                {{ t.name }} ({{ t.key }})
              </option>
            </select>
          </div>
          <div>
            <label class="ct-label mb-1 block text-muted-foreground">Title</label>
            <input
              v-model="dForm.title"
              required
              placeholder="Editorial Design Guideline"
              :class="inputCls"
            />
          </div>
        </div>
        <div>
          <label class="ct-label mb-1 block text-muted-foreground">Body (markdown)</label>
          <textarea
            v-model="dForm.bodyMarkdown"
            rows="4"
            placeholder="Designer role + spec. Consume semantic tokens only."
            :class="inputCls"
          />
        </div>
        <p v-if="dForm.error" class="ct-label text-destructive">{{ dForm.error }}</p>
        <button
          type="submit"
          :disabled="dForm.loading || !dForm.themeKey || !dForm.title"
          class="ct-glow-sm rounded-[var(--radius-card)] bg-accent px-4 py-2 text-sm font-bold text-background hover:opacity-90 disabled:opacity-40"
        >
          {{ dForm.loading ? 'Creating…' : 'Create guideline (active)' }}
        </button>
      </form>

      <ul class="space-y-3">
        <li
          v-for="g in data?.design?.guidelines"
          :key="g.id"
          class="border-b border-border/50 pb-3 last:border-0"
        >
          <div class="flex items-center justify-between gap-2">
            <span
              class="font-medium"
              :class="{ 'text-muted-foreground line-through': g.status === 'inactive' }"
            >
              {{ g.title }}
            </span>
            <div class="flex shrink-0 items-center gap-2">
              <span class="ct-label" :class="statusClass[g.status]">{{ g.status }}</span>
              <span class="ct-label rounded bg-muted px-1.5 py-0.5 text-accent-tertiary">{{
                g.themeKey
              }}</span>
            </div>
          </div>
          <p class="mt-1 text-sm leading-relaxed text-muted-foreground">{{ g.bodyMarkdown }}</p>
          <div v-if="isManager" class="mt-2 flex gap-2">
            <button
              v-if="g.status === 'inactive'"
              :class="btnCls"
              :disabled="busy[g.id]"
              @click="setGuideline(g, 'active')"
            >
              Reactivate
            </button>
            <button
              v-else
              :class="btnCls"
              :disabled="busy[g.id]"
              @click="askDeactivate(`guideline “${g.title}”`, () => setGuideline(g, 'inactive'))"
            >
              Deactivate
            </button>
            <button
              :class="btnCls"
              class="text-destructive"
              :disabled="busy[g.id]"
              @click="removeGuideline(g)"
            >
              Delete
            </button>
          </div>
        </li>
        <li v-if="!data?.design?.guidelines?.length" class="text-sm text-muted-foreground">
          No guidelines yet.
        </li>
      </ul>

      <div class="mt-4 flex flex-wrap gap-2 border-t border-border/50 pt-4">
        <span
          v-for="t in data?.design?.themes"
          :key="t.key"
          class="ct-label rounded-[var(--radius-card)] border border-border px-2 py-1"
          :class="
            t.key === data?.design?.activeThemeKey
              ? 'border-accent text-accent'
              : 'text-muted-foreground'
          "
        >
          {{ t.name }}
        </span>
      </div>
    </section>

    <ConfirmDialog
      :open="!!confirmState"
      danger
      title="Deactivate equipment?"
      :message="`Deactivate ${confirmState?.label}? It stops being enforced immediately. You can reactivate it later.`"
      confirm-label="Deactivate"
      @confirm="onConfirm"
      @cancel="confirmState = null"
    />
  </div>
</template>
