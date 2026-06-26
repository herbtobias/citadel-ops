<script setup lang="ts">
definePageMeta({ layout: false })

const email = ref('')
const done = ref(false)
const loading = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/auth/forgot-password', { method: 'POST', body: { email: email.value } })
    done.value = true
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Request failed'
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
        <h1 class="ct-heading text-lg font-bold tracking-widest">RESET ACCESS</h1>
      </div>

      <template v-if="done">
        <p class="ct-label mb-6 text-muted-foreground">
          If that email has an account, a reset link is on its way. Check your inbox — the link
          expires in 1 hour.
        </p>
        <NuxtLink to="/login" class="ct-label text-accent hover:underline"
          >← Back to login</NuxtLink
        >
      </template>

      <template v-else>
        <p class="ct-label mb-6 text-muted-foreground">
          Enter your email and we'll send a reset link.
        </p>
        <form class="space-y-4" @submit.prevent="submit">
          <div>
            <label class="ct-label mb-1 block text-muted-foreground">Email</label>
            <input
              v-model="email"
              type="email"
              autocomplete="username"
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
            {{ loading ? 'Sending…' : 'Send reset link' }}
          </button>
        </form>
        <NuxtLink
          to="/login"
          class="ct-label mt-6 block text-xs text-muted-foreground hover:underline"
          >← Back to login</NuxtLink
        >
      </template>
    </div>
  </div>
</template>
