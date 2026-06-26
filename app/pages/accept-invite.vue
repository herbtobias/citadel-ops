<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const { fetch: refreshSession } = useUserSession()
const projects = useProjectsStore()
const orgs = useOrgStore()

const token = computed(() => route.query.token as string | undefined)
const name = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function accept() {
  if (!token.value) {
    error.value = 'Missing invite token'
    return
  }
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/v1/invitations/accept', {
      method: 'POST',
      body: {
        token: token.value,
        name: name.value || undefined,
        password: password.value || undefined,
      },
    })
    await refreshSession()
    await Promise.all([projects.fetchProjects(), orgs.fetchOrgs()])
    await navigateTo('/')
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Could not accept invitation'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    class="ct-grid-bg flex min-h-screen items-center justify-center bg-background p-6 text-foreground"
    data-theme="defcon-5"
  >
    <div class="ct-card w-full max-w-sm border border-border bg-card p-8">
      <div class="mb-6 flex items-center gap-2">
        <Icon name="lucide:mail-check" class="size-7 text-accent" />
        <h1 class="ct-heading text-lg font-bold tracking-widest">JOIN HQ</h1>
      </div>
      <p v-if="!token" class="ct-label text-destructive">No invite token in the link.</p>
      <template v-else>
        <p class="ct-label mb-6 text-muted-foreground">
          Set credentials to accept. Leave blank if you already have an account (then sign in with
          your password).
        </p>
        <form class="space-y-4" @submit.prevent="accept">
          <div>
            <label class="ct-label mb-1 block text-muted-foreground">Name (new account)</label>
            <input
              v-model="name"
              type="text"
              class="w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label class="ct-label mb-1 block text-muted-foreground">Password</label>
            <input
              v-model="password"
              type="password"
              autocomplete="new-password"
              class="w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <p v-if="error" class="ct-label text-destructive">{{ error }}</p>
          <button
            type="submit"
            :disabled="loading"
            class="ct-glow-sm w-full rounded-[var(--radius-card)] bg-accent px-4 py-2 text-sm font-bold text-background hover:opacity-90 disabled:opacity-50"
          >
            {{ loading ? 'Joining…' : 'Accept invitation' }}
          </button>
        </form>
      </template>
    </div>
  </div>
</template>
