// Citadel Ops — Mission state-machine. Single source of truth for legal
// transitions; used identically by REST and (later) MCP. §7/§12.
import type { missionStatus } from '../db/schema'

export type MissionStatusValue = (typeof missionStatus.enumValues)[number]

// Allowed target statuses for each status. Cold Read gate: designing → cold_read → ready.
const TRANSITIONS: Record<MissionStatusValue, MissionStatusValue[]> = {
  backlog: ['designing', 'ready', 'cancelled'],
  designing: ['cold_read', 'ready', 'backlog', 'cancelled'],
  cold_read: ['ready', 'designing', 'cancelled'], // pass → ready, fail → designing
  ready: ['in_progress', 'backlog', 'cancelled'],
  in_progress: ['in_review', 'blocked', 'ready', 'done', 'cancelled'],
  in_review: ['done', 'in_progress', 'blocked', 'cancelled'],
  blocked: ['in_progress', 'ready', 'cancelled'],
  done: ['in_progress'], // reopen
  cancelled: [],
}

export function canTransition(from: MissionStatusValue, to: MissionStatusValue): boolean {
  if (from === to) return true
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function allowedTransitions(from: MissionStatusValue): MissionStatusValue[] {
  return TRANSITIONS[from] ?? []
}

export function assertTransition(from: MissionStatusValue, to: MissionStatusValue): void {
  if (!canTransition(from, to)) {
    throw createError({
      statusCode: 422,
      statusMessage: `Illegal transition ${from} → ${to}. Allowed: ${allowedTransitions(from).join(', ') || 'none'}`,
    })
  }
}
