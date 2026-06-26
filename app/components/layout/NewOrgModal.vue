<script setup lang="ts">
defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; created: [orgId: string] }>()

const name = ref('')
const slug = ref('')
const ownerEmail = ref('')
const error = ref('')
const loading = ref(false)

// Auto-suggest a slug from the name unless the user typed one.
const slugTouched = ref(false)
watch(name, (n) => {
  if (!slugTouched.value)
    slug.value = n
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
})

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const org = await $fetch<{ id: string }>('/api/v1/organizations', {
      method: 'POST',
      body: { name: name.value, slug: slug.value, ownerEmail: ownerEmail.value },
    })
    emit('created', org.id)
    name.value = ''
    slug.value = ''
    ownerEmail.value = ''
    slugTouched.value = false
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Could not create organization'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
        @click.self="emit('close')"
      >
        <div class="ct-card w-full max-w-md border border-border bg-card p-6">
          <div class="mb-4 flex items-center gap-2">
            <Icon name="lucide:building-2" class="size-6 text-accent" />
            <h2 class="ct-heading text-lg font-bold">New Organization</h2>
          </div>
          <form class="space-y-3" @submit.prevent="submit">
            <div>
              <label class="ct-label mb-1 block text-muted-foreground">Name</label>
              <input
                v-model="name"
                required
                placeholder="Night Division"
                class="w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label class="ct-label mb-1 block text-muted-foreground">Slug</label>
              <input
                v-model="slug"
                required
                pattern="[a-z0-9-]+"
                placeholder="night-division"
                @input="slugTouched = true"
                class="w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label class="ct-label mb-1 block text-muted-foreground"
                >Owner email (existing user → becomes Manager)</label
              >
              <input
                v-model="ownerEmail"
                type="email"
                required
                placeholder="owner@example.com"
                class="w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>
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
                :disabled="loading || !name || !slug || !ownerEmail"
                class="ct-glow-sm rounded-[var(--radius-card)] bg-accent px-4 py-2 text-sm font-bold text-background hover:opacity-90 disabled:opacity-40"
              >
                {{ loading ? 'Creating…' : 'Create' }}
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
