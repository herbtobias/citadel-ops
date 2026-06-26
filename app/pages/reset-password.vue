<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const token = computed(() => (route.query.token as string) || '')
const password = ref('')
const confirm = ref('')
const done = ref(false)
const loading = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters'
    return
  }
  if (password.value !== confirm.value) {
    error.value = 'Passwords do not match'
    return
  }
  loading.value = true
  try {
    await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { token: token.value, password: password.value },
    })
    done.value = true
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Reset failed'
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
        <Icon name="lucide:key-round" class="size-7 text-accent" />
        <h1 class="ct-heading text-lg font-bold tracking-widest">NEW CREDENTIALS</h1>
      </div>

      <template v-if="done">
        <p class="ct-label mb-6 text-muted-foreground">
          Password updated. You can sign in with your new credentials.
        </p>
        <NuxtLink to="/login" class="ct-label text-accent hover:underline">→ Go to login</NuxtLink>
      </template>

      <template v-else-if="!token">
        <p class="ct-label text-destructive">Missing or invalid reset link.</p>
        <NuxtLink to="/forgot-password" class="ct-label mt-4 block text-accent hover:underline"
          >Request a new one</NuxtLink
        >
      </template>

      <template v-else>
        <form class="space-y-4" @submit.prevent="submit">
          <div>
            <label class="ct-label mb-1 block text-muted-foreground">New password</label>
            <input
              v-model="password"
              type="password"
              autocomplete="new-password"
              required
              class="w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label class="ct-label mb-1 block text-muted-foreground">Confirm password</label>
            <input
              v-model="confirm"
              type="password"
              autocomplete="new-password"
              required
              class="w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <p v-if="error" class="ct-label text-destructive">{{ error }}</p>
          <button
            type="submit"
            :disabled="loading"
            class="ct-glow-sm w-full rounded-[var(--radius-card)] bg-accent px-4 py-2 text-sm font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {{ loading ? 'Updating…' : 'Set new password' }}
          </button>
        </form>
      </template>
    </div>
  </div>
</template>
