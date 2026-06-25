import { defineStore } from 'pinia'

// Per-user UI state (active org/project, sidebar). In P2 this is hydrated per user.
export const useUiStore = defineStore('ui', () => {
  const sidebarOpen = ref(true)
  const activeOrgId = ref('')
  const activeProjectId = ref('')

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
  }

  function setActiveProject(id: string) {
    activeProjectId.value = id
  }

  return { sidebarOpen, activeOrgId, activeProjectId, toggleSidebar, setActiveProject }
})
