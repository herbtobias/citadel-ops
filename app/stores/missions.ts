import { defineStore } from 'pinia'
import type { Mission, MissionStatus } from '~/types'

// P1: loads from the Nitro API; transitions go through the state-machine endpoint.
export const useMissionsStore = defineStore('missions', () => {
  const missions = ref<Mission[]>([])

  async function fetchMissions(projectId: string): Promise<Mission[]> {
    // useRequestFetch forwards the session cookie during SSR (plain $fetch on client).
    const data = await useRequestFetch()<Mission[]>(`/api/v1/projects/${projectId}/missions`)
    missions.value = [...missions.value.filter((m) => m.projectId !== projectId), ...data]
    return data
  }

  function byProject(projectId: string): Mission[] {
    return missions.value.filter((m) => m.projectId === projectId)
  }

  function byKey(key: string): Mission | undefined {
    return missions.value.find((m) => m.key === key)
  }

  function byStatus(projectId: string, status: MissionStatus): Mission[] {
    return byProject(projectId)
      .filter((m) => m.status === status)
      .sort((a, b) => a.orderIndex - b.orderIndex)
  }

  // Create a mission (HQ planning). Server assigns the key + lands it in backlog.
  async function createMission(projectId: string, body: Record<string, unknown>): Promise<Mission> {
    const created = await $fetch<Mission>(`/api/v1/projects/${projectId}/missions`, {
      method: 'POST',
      body,
    })
    missions.value = [...missions.value, created]
    return created
  }

  // Optimistic move; the server enforces the state-machine and rolls back on 422.
  async function moveMission(id: string, newStatus: MissionStatus) {
    const m = missions.value.find((x) => x.id === id)
    if (!m || m.status === newStatus) return
    const prev = m.status
    m.status = newStatus
    try {
      const updated = await $fetch<Mission>(`/api/v1/missions/${id}/transition`, {
        method: 'POST',
        body: { to: newStatus },
      })
      Object.assign(m, updated)
    } catch (e) {
      m.status = prev
      throw e
    }
  }

  return { missions, fetchMissions, createMission, byProject, byKey, byStatus, moveMission }
})
