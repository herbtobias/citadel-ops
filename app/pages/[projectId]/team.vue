<script setup lang="ts">
const orgs = useOrgStore()

interface Member { userId: string, email: string, name: string, role: string, status: string }
interface Invite { id: string, email: string, role: string, token: string }

const isManager = computed(() => orgs.activeRole === 'manager')

const { data, refresh, pending } = await useAsyncData(
  'team-members',
  async () => {
    if (!orgs.activeOrgId || !isManager.value) return { members: [], invitations: [] }
    return useRequestFetch()<{ members: Member[], invitations: Invite[] }>(`/api/v1/organizations/${orgs.activeOrgId}/members`)
  },
  { watch: [() => orgs.activeOrgId] },
)

const inviteEmail = ref('')
const inviteRole = ref<'manager' | 'contributor' | 'viewer'>('contributor')
const inviteError = ref('')
const lastInvite = ref<{ email: string, acceptUrl: string } | null>(null)

async function sendInvite() {
  inviteError.value = ''
  lastInvite.value = null
  try {
    const res = await $fetch<{ email: string, acceptUrl: string }>(
      `/api/v1/organizations/${orgs.activeOrgId}/invitations`,
      { method: 'POST', body: { email: inviteEmail.value, role: inviteRole.value } },
    )
    lastInvite.value = res
    inviteEmail.value = ''
    await refresh()
  }
  catch (e: any) {
    inviteError.value = e?.data?.statusMessage || e?.statusMessage || 'Invite failed'
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8">
    <div class="flex items-center gap-3">
      <Icon name="lucide:users" class="size-7 text-accent" />
      <h1 class="ct-heading text-xl font-bold">{{ orgs.activeOrg?.name ?? 'Team' }}</h1>
    </div>

    <p v-if="!isManager" class="ct-card border border-border bg-card p-4 text-sm text-muted-foreground">
      Only organization managers can manage members. Your role:
      <span class="text-accent">{{ orgs.activeRole ?? '—' }}</span>.
    </p>

    <template v-else>
      <!-- Invite -->
      <section class="ct-card border border-border bg-card p-5">
        <h2 class="ct-label mb-3 text-muted-foreground">Invite member</h2>
        <form class="flex flex-wrap items-end gap-3" @submit.prevent="sendInvite">
          <div class="flex-1 min-w-[200px]">
            <label class="ct-label mb-1 block text-muted-foreground">Email</label>
            <input v-model="inviteEmail" type="email" required placeholder="agent@example.com"
              class="w-full rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none">
          </div>
          <div>
            <label class="ct-label mb-1 block text-muted-foreground">Role</label>
            <select v-model="inviteRole"
              class="rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none">
              <option value="manager">Manager</option>
              <option value="contributor">Contributor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <button type="submit"
            class="ct-glow-sm rounded-[var(--radius-card)] bg-accent px-4 py-2 text-sm font-bold text-background hover:opacity-90">
            Send invite
          </button>
        </form>
        <p v-if="inviteError" class="ct-label mt-3 text-destructive">{{ inviteError }}</p>
        <p v-if="lastInvite" class="ct-label mt-3 text-muted-foreground">
          Invite created for <span class="text-accent">{{ lastInvite.email }}</span>. Share this link
          (email delivery lands in P8):
          <code class="text-accent">{{ lastInvite.acceptUrl }}</code>
        </p>
      </section>

      <!-- Members -->
      <section class="ct-card border border-border bg-card p-5">
        <h2 class="ct-label mb-3 text-muted-foreground">Members</h2>
        <table class="w-full text-sm">
          <thead>
            <tr class="ct-label border-b border-border text-left text-muted-foreground">
              <th class="py-2">Name</th><th>Email</th><th>Role</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in data?.members" :key="m.userId" class="border-b border-border/50">
              <td class="py-2">{{ m.name }}</td>
              <td class="text-muted-foreground">{{ m.email }}</td>
              <td><span class="text-accent">{{ m.role }}</span></td>
              <td class="text-muted-foreground">{{ m.status }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Pending invites -->
      <section v-if="data?.invitations?.length" class="ct-card border border-border bg-card p-5">
        <h2 class="ct-label mb-3 text-muted-foreground">Pending invitations</h2>
        <ul class="space-y-2 text-sm">
          <li v-for="i in data.invitations" :key="i.id" class="flex items-center justify-between border-b border-border/50 pb-2">
            <span>{{ i.email }} · <span class="text-accent">{{ i.role }}</span></span>
            <code class="ct-label text-xs text-muted-foreground">/accept-invite?token={{ i.token }}</code>
          </li>
        </ul>
      </section>

      <p v-if="pending" class="ct-label text-muted-foreground">Loading…</p>
    </template>
  </div>
</template>
