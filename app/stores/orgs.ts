import { defineStore } from 'pinia'

export interface Org {
  id: string
  name: string
  slug: string
  role: 'manager' | 'contributor' | 'viewer'
}

// Organizations the signed-in user belongs to + the active-org selection (per browser).
export const useOrgStore = defineStore('orgs', () => {
  const orgs = ref<Org[]>([])
  const activeOrgId = ref<string>('')

  async function fetchOrgs(): Promise<Org[]> {
    // useRequestFetch forwards the session cookie during SSR (plain $fetch on client).
    const data = await useRequestFetch()<Org[]>('/api/v1/organizations')
    orgs.value = data
    if (!activeOrgId.value || !data.some(o => o.id === activeOrgId.value)) {
      activeOrgId.value = data[0]?.id ?? ''
    }
    return data
  }

  function setActiveOrg(id: string) {
    activeOrgId.value = id
    if (import.meta.client) localStorage.setItem('citadel-active-org', id)
  }

  function initActiveOrg() {
    if (import.meta.client) {
      const saved = localStorage.getItem('citadel-active-org')
      if (saved && orgs.value.some(o => o.id === saved)) activeOrgId.value = saved
    }
  }

  const activeOrg = computed(() => orgs.value.find(o => o.id === activeOrgId.value))
  const activeRole = computed(() => activeOrg.value?.role)

  return { orgs, activeOrgId, activeOrg, activeRole, fetchOrgs, setActiveOrg, initActiveOrg }
})
