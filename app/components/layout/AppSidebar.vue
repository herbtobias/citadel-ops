<script setup lang="ts">
const ui = useUiStore()
const projects = useProjectsStore()
const orgs = useOrgStore()
const route = useRoute()
const { user } = useUserSession()

const isSuperAdmin = computed(() => (user.value as any)?.systemRole === 'super_admin')
const isManager = computed(() => isSuperAdmin.value || orgs.activeRole === 'manager')

// Projects in the active organization only.
const orgProjects = computed(() => projects.projects.filter((p) => p.orgId === orgs.activeOrgId))

const showNewOrg = ref(false)
const showNewProject = ref(false)

async function onOrgCreated(orgId: string) {
  showNewOrg.value = false
  await orgs.fetchOrgs()
  orgs.setActiveOrg(orgId)
  // New org has no projects yet — the sidebar shows "No projects yet" + the + button.
}

async function onProjectCreated(projectId: string) {
  await projects.fetchProjects()
  showNewProject.value = false
  await onSwitchProject(projectId)
}

const nav = [
  { key: 'board', icon: 'lucide:columns-3', to: (id: string) => `/${id}/board` },
  { key: 'situation-room', icon: 'lucide:radar', to: (id: string) => `/${id}/situation-room` },
  { key: 'operations', icon: 'lucide:target', to: (id: string) => `/${id}/operations` },
  { key: 'q-branch', icon: 'lucide:flask-conical', to: (id: string) => `/${id}/q-branch` },
  { key: 'm-desk', icon: 'lucide:id-card', to: (id: string) => `/${id}/m-desk` },
  { key: 'team', icon: 'lucide:users', to: (id: string) => `/${id}/team` },
  { key: 'audit', icon: 'lucide:scroll-text', to: (id: string) => `/${id}/audit` },
  { key: 'diagnostics', icon: 'lucide:activity', to: (id: string) => `/${id}/diagnostics` },
  { key: 'console', icon: 'lucide:terminal', to: (id: string) => `/${id}/console` },
  { key: 'admin', icon: 'lucide:shield', to: (id: string) => `/${id}/admin` },
]

// Route param is the source of truth (consistent SSR & client); UI store is fallback.
const pid = computed(() => (route.params.projectId as string) || ui.activeProjectId)
function isActive(to: string) {
  return route.path === to
}

// Switching projects navigates to that project's board.
async function onSwitchProject(id: string) {
  ui.setActiveProject(id)
  await navigateTo(`/${id}/board`)
}

// Switching org navigates to the first project of that org (if any).
async function onSwitchOrg(id: string) {
  orgs.setActiveOrg(id)
  const first = projects.projects.find((p) => p.orgId === id)
  if (first) await onSwitchProject(first.id)
}
</script>

<template>
  <aside
    class="flex flex-col border-r border-border bg-card transition-all duration-200"
    :class="ui.sidebarOpen ? 'w-60' : 'w-16'"
  >
    <!-- Brand + project switcher -->
    <div class="flex h-16 items-center gap-2 border-b border-border px-4">
      <Icon name="lucide:shield-half" class="size-6 text-accent" />
      <span v-if="ui.sidebarOpen" class="ct-heading text-sm font-bold tracking-widest"
        >CITADEL OPS</span
      >
    </div>

    <div v-if="ui.sidebarOpen" class="space-y-3 border-b border-border p-3">
      <div v-if="orgs.orgs.length">
        <div class="mb-2 flex items-center justify-between">
          <p class="ct-label text-muted-foreground">Organization</p>
          <button
            v-if="isSuperAdmin"
            class="ct-label text-muted-foreground hover:text-accent"
            title="New organization"
            @click="showNewOrg = true"
          >
            <Icon name="lucide:plus" class="size-4" />
          </button>
        </div>
        <select
          :value="orgs.activeOrgId"
          class="w-full rounded-[var(--radius-card)] border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
          @change="onSwitchOrg(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="o in orgs.orgs" :key="o.id" :value="o.id">
            {{ o.name }} · {{ o.role }}
          </option>
        </select>
      </div>
      <div>
        <div class="mb-2 flex items-center justify-between">
          <p class="ct-label text-muted-foreground">Project</p>
          <button
            v-if="isManager"
            class="ct-label text-muted-foreground hover:text-accent"
            title="New project"
            @click="showNewProject = true"
          >
            <Icon name="lucide:plus" class="size-4" />
          </button>
        </div>
        <select
          v-if="orgProjects.length"
          :value="pid"
          class="w-full rounded-[var(--radius-card)] border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
          @change="onSwitchProject(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="p in orgProjects" :key="p.id" :value="p.id">
            {{ p.key }} · {{ p.name }}
          </option>
        </select>
        <p v-else class="ct-label text-muted-foreground">No projects yet</p>
      </div>
    </div>

    <NewOrgModal :open="showNewOrg" @close="showNewOrg = false" @created="onOrgCreated" />
    <NewProjectModal
      :open="showNewProject"
      :org-id="orgs.activeOrgId"
      @close="showNewProject = false"
      @created="onProjectCreated"
    />

    <!-- Nav -->
    <nav class="flex-1 space-y-1 p-2">
      <NuxtLink
        v-for="item in nav"
        :key="item.key"
        :to="item.to(pid)"
        class="flex items-center gap-3 rounded-[var(--radius-card)] px-3 py-2 text-sm transition-colors hover:bg-muted hover:text-accent"
        :class="isActive(item.to(pid)) ? 'bg-muted text-accent ct-glow-sm' : 'text-foreground'"
      >
        <Icon :name="item.icon" class="size-5 shrink-0" />
        <span v-if="ui.sidebarOpen" class="ct-label">{{ $t(`nav.${item.key}`) }}</span>
      </NuxtLink>
    </nav>

    <button
      class="m-2 flex items-center justify-center rounded-[var(--radius-card)] p-2 text-muted-foreground hover:bg-muted hover:text-accent"
      @click="ui.toggleSidebar()"
    >
      <Icon
        :name="ui.sidebarOpen ? 'lucide:panel-left-close' : 'lucide:panel-left-open'"
        class="size-5"
      />
    </button>
  </aside>
</template>
