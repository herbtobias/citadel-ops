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
  return n.split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
})

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}
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
          :class="locale === l ? 'bg-accent text-background' : 'text-muted-foreground hover:text-accent'"
          @click="setLocale(l as 'en' | 'de')"
        >
          {{ l }}
        </button>
      </div>

      <button class="relative text-muted-foreground hover:text-accent">
        <Icon name="lucide:bell" class="size-5" />
        <span class="absolute -right-1 -top-1 size-2 rounded-full bg-accent ct-glow-sm" />
      </button>

      <div class="flex items-center gap-2">
        <div
          class="flex size-8 items-center justify-center rounded-full border border-border bg-muted text-xs"
          :title="(user as any)?.name ?? ''"
        >
          {{ initials }}
        </div>
        <button class="text-muted-foreground hover:text-destructive" title="Sign out" @click="logout">
          <Icon name="lucide:log-out" class="size-5" />
        </button>
      </div>
    </div>
  </header>
</template>
