import { defineStore } from 'pinia'
import type { Operation, Project } from '~/types'

// P1: loads from the Nitro API (/api/v1). Fetch methods return the data so callers
// can wrap them in useAsyncData (SSR payload transfer, no client refetch).
export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([])
  const operations = ref<Operation[]>([])
  const loaded = ref(false)

  async function fetchProjects(): Promise<Project[]> {
    // useRequestFetch forwards the session cookie during SSR (plain $fetch on client).
    const data = await useRequestFetch()<Project[]>('/api/v1/projects')
    projects.value = data
    loaded.value = true
    return data
  }

  async function fetchOperations(projectId: string): Promise<Operation[]> {
    const ops = await useRequestFetch()<Operation[]>(`/api/v1/projects/${projectId}/operations`)
    operations.value = [...operations.value.filter(o => o.projectId !== projectId), ...ops]
    return ops
  }

  function byId(id: string): Project | undefined {
    return projects.value.find(p => p.id === id)
  }

  function activeOperation(projectId: string): Operation | undefined {
    return operations.value.find(o => o.projectId === projectId && o.status === 'active')
  }

  return { projects, operations, loaded, fetchProjects, fetchOperations, byId, activeOperation }
})
