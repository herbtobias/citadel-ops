<script setup lang="ts">
const projects = useProjectsStore()
const ui = useUiStore()
const route = useRoute()
const { THEMES, activeTheme, setOverride } = useTheme()
const { locale, setLocale } = useI18n()
const { user, clear } = useUserSession()

// Route param is the source of truth (consistent SSR & client); UI store is fallback.
const pid = computed(() => (route.params.projectId as string) || ui.activeProjectId)
const project = computed(() => projects.byId(pid.value))
const operation = computed(() => projects.activeOperation(pid.value))

const initials = computed(() => {
  const n = (user.value as any)?.name ?? 'HQ'
  return n
    .split(/\s+/)
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
})

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}

// ── Notifications ──
interface Notif {
  id: string
  type: string
  payload: any
  createdAt: string
  readAt: string | null
}
const notifOpen = ref(false)
const notifs = ref<Notif[]>([])
const unread = ref(0)

async function loadNotifs() {
  try {
    const r = await $fetch<{ unread: number; notifications: Notif[] }>(
      '/api/v1/notifications?limit=20',
    )
    notifs.value = r.notifications
    unread.value = r.unread
  } catch {
    /* not logged in / no access */
  }
}
async function markAllRead() {
  await $fetch('/api/v1/notifications/read', { method: 'POST', body: {} })
  await loadNotifs()
}
function toggleNotifs() {
  notifOpen.value = !notifOpen.value
  if (notifOpen.value) loadNotifs()
}
onMounted(loadNotifs)
watch(() => route.fullPath, loadNotifs)

// ── Live intervention alerts ──
// The bell + a toast surface actionable agent events in real time, on any page.
const { push } = useToasts()
const TOAST_FOR: Record<string, { tone: 'info' | 'accent' | 'destructive'; title: string }> = {
  submitted_for_review: { tone: 'accent', title: 'Mission needs review' },
  blocked: { tone: 'destructive', title: 'Mission blocked' },
  lease_expired: { tone: 'destructive', title: 'Lease expired — mission re-queued' },
  handed_off: { tone: 'info', title: 'Mission handed off' },
  archive_updated: { tone: 'info', title: 'Archive updated' },
}
let notifTimer: any = null
useProjectEvents(pid, (e) => {
  const spec = TOAST_FOR[e.type]
  if (!spec) return
  // Toast is instant from the event; the badge re-pulls from the DB (the notification
  // is written async by Leiter) shortly after, so it stays authoritative.
  push({ tone: spec.tone, title: spec.title, body: e.message || undefined })
  clearTimeout(notifTimer)
  notifTimer = setTimeout(loadNotifs, 400)
})
onBeforeUnmount(() => clearTimeout(notifTimer))
</script>

<template>
  <header class="flex h-16 items-center justify-between gap-4 border-b border-border bg-card px-6">
    <div class="min-w-0">
      <h1 class="ct-heading truncate text-base font-bold">
        {{ project?.name ?? 'Citadel Ops' }}
      </h1>
      <p v-if="operation" class="ct-label truncate text-muted-foreground">
        {{ operation.codename }} · {{ operation.status }}
      </p>
    </div>

    <div class="flex items-center gap-3">
      <!-- Theme switcher -->
      <select
        :value="activeTheme"
        class="rounded-[var(--radius-card)] border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
        @change="setOverride(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="t in THEMES" :key="t.key" :value="t.key">{{ t.name }}</option>
      </select>

      <!-- Language -->
      <div class="flex overflow-hidden rounded-[var(--radius-card)] border border-border">
        <button
          v-for="l in ['en', 'de']"
          :key="l"
          class="px-2 py-1 text-xs uppercase"
          :class="
            locale === l ? 'bg-accent text-background' : 'text-muted-foreground hover:text-accent'
          "
          @click="setLocale(l as 'en' | 'de')"
        >
          {{ l }}
        </button>
      </div>

      <!-- Notifications -->
      <div class="relative">
        <button class="relative text-muted-foreground hover:text-accent" @click="toggleNotifs">
          <Icon name="lucide:bell" class="size-5" />
          <span
            v-if="unread"
            class="absolute -right-1.5 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-background ct-glow-sm"
            >{{ unread }}</span
          >
        </button>
        <div
          v-if="notifOpen"
          class="ct-card absolute right-0 top-8 z-50 w-80 border border-border bg-card p-3 shadow-xl"
        >
          <div class="mb-2 flex items-center justify-between">
            <span class="ct-label text-muted-foreground">Notifications</span>
            <button v-if="unread" class="ct-label text-accent hover:underline" @click="markAllRead">
              mark all read
            </button>
          </div>
          <ul class="max-h-80 space-y-2 overflow-y-auto">
            <li
              v-for="n in notifs"
              :key="n.id"
              class="border-b border-border/50 pb-2 text-sm"
              :class="n.readAt ? 'opacity-50' : ''"
            >
              <span class="ct-label text-accent-tertiary">{{ n.type.replace('_', ' ') }}</span>
              <p v-if="n.payload?.message" class="text-muted-foreground">{{ n.payload.message }}</p>
            </li>
            <li v-if="!notifs.length" class="text-sm text-muted-foreground">No notifications.</li>
          </ul>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <div
          class="flex size-8 items-center justify-center rounded-full border border-border bg-muted text-xs"
          :title="(user as any)?.name ?? ''"
        >
          {{ initials }}
        </div>
        <button
          class="text-muted-foreground hover:text-destructive"
          title="Sign out"
          @click="logout"
        >
          <Icon name="lucide:log-out" class="size-5" />
        </button>
      </div>
    </div>
  </header>
</template>
