<script setup lang="ts">
// Ops Console — fire API calls by hand (HQ session and/or agent License) and inspect
// the raw response + its traceId (look it up in Admin → Trace Log).
const route = useRoute()
const projectId = computed(() => route.params.projectId as string)

const DEMO_LICENSES = [
  { alias: '006 FRONTEND/DESIGN', key: 'lic_006_demo' },
  { alias: '007 BACKEND', key: 'lic_007_demo' },
  { alias: '009 QA', key: 'lic_009_demo' },
]

const method = ref<'GET' | 'POST' | 'DELETE'>('POST')
const path = ref('/api/v1/agent/check-in')
const body = ref('')
const sendAsAgent = ref(true)
const license = ref('lic_006_demo')

function pickLicense(l: (typeof DEMO_LICENSES)[number]) {
  license.value = l.key
  sendAsAgent.value = true
}

const loading = ref(false)
const resp = ref<{ status: number; traceId: string | null; data: any } | null>(null)
const error = ref('')

async function send() {
  error.value = ''
  resp.value = null
  loading.value = true
  try {
    const headers: Record<string, string> = {}
    let payload: string | undefined
    if (body.value.trim()) {
      try {
        payload = JSON.stringify(JSON.parse(body.value))
      } catch {
        throw new Error('Body is not valid JSON')
      }
      headers['content-type'] = 'application/json'
    }
    if (sendAsAgent.value && license.value) headers.authorization = `Bearer ${license.value}`

    const res = await fetch(path.value, {
      method: method.value,
      headers,
      body: payload,
      credentials: 'include',
    })
    const text = await res.text()
    let data: any = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }
    resp.value = { status: res.status, traceId: res.headers.get('x-trace-id'), data }
  } catch (e: any) {
    error.value = e?.message ?? String(e)
  } finally {
    loading.value = false
  }
}

interface QA {
  label: string
  method: 'GET' | 'POST' | 'DELETE'
  path: string | (() => string)
  body?: string
  agent: boolean
}
const pid = () => projectId.value

const quickActions: QA[] = [
  { label: 'check-in', method: 'POST', path: '/api/v1/agent/check-in', agent: true },
  { label: 'claim-next', method: 'POST', path: '/api/v1/agent/claim-next', agent: true },
  { label: 'orders', method: 'GET', path: '/api/v1/agent/orders', agent: true },
  {
    label: 'briefing',
    method: 'GET',
    path: () => `/api/v1/projects/${pid()}/briefing`,
    agent: true,
  },
  {
    label: 'quality-gates',
    method: 'GET',
    path: () => `/api/v1/projects/${pid()}/quality-gates`,
    agent: true,
  },
  {
    label: 'heartbeat',
    method: 'POST',
    path: '/api/v1/agent/missions/MISSION_ID/heartbeat',
    agent: true,
  },
  {
    label: 'attach test_report',
    method: 'POST',
    path: '/api/v1/agent/missions/MISSION_ID/artifacts',
    body: '{\n  "kind": "test_report",\n  "url": "#",\n  "label": "green"\n}',
    agent: true,
  },
  {
    label: 'hand-off',
    method: 'POST',
    path: '/api/v1/agent/missions/MISSION_ID/hand-off',
    body: '{\n  "sector": "QA",\n  "type": "test",\n  "title": "Verify X",\n  "linkType": "tests"\n}',
    agent: true,
  },
  {
    label: 'complete',
    method: 'POST',
    path: '/api/v1/agent/missions/MISSION_ID/complete',
    body: '{\n  "result": "success"\n}',
    agent: true,
  },
  {
    label: 'HQ: list missions',
    method: 'GET',
    path: () => `/api/v1/projects/${pid()}/missions`,
    agent: false,
  },
  {
    label: 'HQ: metrics',
    method: 'GET',
    path: () => `/api/v1/projects/${pid()}/metrics`,
    agent: false,
  },
  {
    label: 'HQ: issue license',
    method: 'POST',
    path: () => `/api/v1/projects/${pid()}/licenses`,
    body: '{\n  "agentAlias": "010",\n  "sectors": ["BACKEND"]\n}',
    agent: false,
  },
]

function applyQA(q: QA) {
  method.value = q.method
  path.value = typeof q.path === 'function' ? q.path() : q.path
  body.value = q.body ?? ''
  sendAsAgent.value = q.agent
}
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <div class="flex items-center gap-3">
      <Icon name="lucide:terminal" class="size-7 text-accent" />
      <h1 class="ct-heading text-xl font-bold">Ops Console</h1>
    </div>

    <!-- Quick actions -->
    <section class="ct-card border border-border bg-card p-4">
      <p class="ct-label mb-2 text-muted-foreground">Quick actions (prefill the request)</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="q in quickActions"
          :key="q.label"
          class="ct-label rounded-[var(--radius-card)] border border-border px-2 py-1 text-muted-foreground hover:border-accent hover:text-accent"
          @click="applyQA(q)"
        >
          {{ q.label }}
        </button>
      </div>
    </section>

    <!-- Request builder -->
    <section class="ct-card border border-border bg-card p-5 space-y-3">
      <div class="flex gap-2">
        <select
          v-model="method"
          class="rounded-[var(--radius-card)] border border-border bg-background px-2 py-2 text-sm focus:border-accent focus:outline-none"
        >
          <option>GET</option>
          <option>POST</option>
          <option>DELETE</option>
        </select>
        <input
          v-model="path"
          class="flex-1 rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none"
        />
        <button
          :disabled="loading"
          class="ct-glow-sm rounded-[var(--radius-card)] bg-accent px-5 py-2 text-sm font-bold text-background hover:opacity-90 disabled:opacity-50"
          @click="send"
        >
          {{ loading ? '…' : 'Send' }}
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <label class="ct-label flex items-center gap-2 text-muted-foreground">
          <input v-model="sendAsAgent" type="checkbox" /> send as agent (Bearer license)
        </label>
        <input
          v-model="license"
          :disabled="!sendAsAgent"
          class="flex-1 min-w-[200px] rounded-[var(--radius-card)] border border-border bg-background px-3 py-1.5 font-mono text-xs focus:border-accent focus:outline-none disabled:opacity-40"
        />
        <div class="flex gap-1">
          <button
            v-for="l in DEMO_LICENSES"
            :key="l.key"
            class="ct-label rounded border border-border px-1.5 py-0.5 text-muted-foreground hover:text-accent"
            :title="l.key"
            @click="pickLicense(l)"
          >
            {{ l.alias.split(' ')[0] }}
          </button>
        </div>
      </div>

      <textarea
        v-model="body"
        rows="6"
        placeholder="JSON body (optional)"
        class="w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none"
      />
      <p v-if="error" class="ct-label text-destructive">{{ error }}</p>
    </section>

    <!-- Response -->
    <section v-if="resp" class="ct-card border border-border bg-card p-5">
      <div class="mb-2 flex items-center justify-between">
        <span
          class="ct-label"
          :class="
            resp.status < 300
              ? 'text-accent'
              : resp.status < 500
                ? 'text-accent-secondary'
                : 'text-destructive'
          "
          >HTTP {{ resp.status }}</span
        >
        <span v-if="resp.traceId" class="ct-label text-muted-foreground"
          >trace {{ resp.traceId.slice(0, 16) }}…</span
        >
      </div>
      <pre
        class="max-h-[28rem] overflow-auto rounded-[var(--radius-card)] bg-background p-3 font-mono text-xs leading-relaxed"
        >{{ JSON.stringify(resp.data, null, 2) }}</pre
      >
    </section>
  </div>
</template>
