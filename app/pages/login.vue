<script setup lang="ts">
definePageMeta({ layout: false })

const { fetch: refreshSession } = useUserSession()
const route = useRoute()
const projects = useProjectsStore()
const orgs = useOrgStore()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { email: email.value, password: password.value } })
    await refreshSession()
    await Promise.all([projects.fetchProjects(), orgs.fetchOrgs()])
    const redirect = (route.query.redirect as string) || '/'
    await navigateTo(redirect)
  }
  catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Login failed'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="ct-grid-bg flex min-h-screen items-center justify-center bg-background p-6 text-foreground" data-theme="defcon-5">
    <div class="ct-card w-full max-w-sm border border-border bg-card p-8">
      <div class="mb-6 flex items-center gap-2">
        <Icon name="lucide:shield-half" class="size-7 text-accent" />
        <h1 class="ct-heading text-lg font-bold tracking-widest">CITADEL OPS</h1>
      </div>
      <p class="ct-label mb-6 text-muted-foreground">Identify yourself, operative.</p>

      <form class="space-y-4" @submit.prevent="submit">
        <div>
          <label class="ct-label mb-1 block text-muted-foreground">Email</label>
          <input
            v-model="email" type="email" autocomplete="username" required
            class="w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          >
        </div>
        <div>
          <label class="ct-label mb-1 block text-muted-foreground">Password</label>
          <input
            v-model="password" type="password" autocomplete="current-password" required
            class="w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          >
        </div>

        <p v-if="error" class="ct-label text-destructive">{{ error }}</p>

        <button
          type="submit" :disabled="loading"
          class="ct-glow-sm w-full rounded-[var(--radius-card)] bg-accent px-4 py-2 text-sm font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {{ loading ? 'Authenticating…' : 'Acquire License' }}
        </button>
      </form>

      <p class="ct-label mt-6 text-xs text-muted-foreground">
        Demo: herb.tobias@gmail.com · citadel123
      </p>
    </div>
  </div>
</template>
