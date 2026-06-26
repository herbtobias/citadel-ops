// Citadel Ops — shared domain types (§3 of the concept). All terms English.

export type Sector = 'FRONTEND' | 'BACKEND' | 'QA' | 'INFRA' | 'SECURITY' | 'DESIGN'

export type MissionType = 'design' | 'feature' | 'test' | 'bugfix' | 'spike' | 'chore' | 'research'

export type MissionStatus =
  | 'backlog'
  | 'designing'
  | 'cold_read'
  | 'ready'
  | 'in_progress'
  | 'in_review'
  | 'blocked'
  | 'done'
  | 'cancelled'

export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export type OperationStatus = 'planned' | 'active' | 'completed' | 'archived'

export type LinkType =
  | 'spawned_from'
  | 'spawns'
  | 'tests'
  | 'tested_by'
  | 'fixes'
  | 'fixed_by'
  | 'blocks'
  | 'blocked_by'
  | 'relates_to'
  | 'duplicates'
  | 'part_of'
  | 'follow_up_of'

export type RefKind = 'mission' | 'operation'

export interface MissionRef {
  linkType: LinkType
  targetKind: RefKind
  targetKey: string
  note?: string
}

export interface Artifact {
  id: string
  kind: 'pr' | 'commit' | 'file' | 'url' | 'test_report'
  url: string
  label: string
}

export interface Mission {
  id: string
  key: string
  projectId: string
  operationId: string | null
  codename: string | null
  title: string
  objective: string
  briefing: string
  type: MissionType
  sector: Sector
  requiredSkills: string[]
  status: MissionStatus
  priority: Priority
  estimatePoints: number | null
  orderIndex: number
  acceptanceCriteria: string[]
  dossierId: string | null
  parentId: string | null
  links: MissionRef[]
  artifacts: Artifact[]
  claimedByAlias: string | null
  outcome: string | null
  result: 'success' | 'failed' | null
  commentCount: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface Operation {
  id: string
  key: string
  projectId: string
  codename: string
  objective: string
  status: OperationStatus
  startsAt: string | null
  endsAt: string | null
  capacityPoints: number | null
  sectorsInScope: Sector[]
  briefingSummary: string
  successCriteria: string[]
}

export interface Project {
  id: string
  orgId: string
  key: string
  name: string
  description: string
  activeThemeKey: string
  statusColumns: MissionStatus[]
  sectors: Sector[]
}

export interface Agent {
  alias: string
  sectors: Sector[]
  status: 'active' | 'revoked' | 'idle'
  lastSeen: string | null
  currentMissionKey: string | null
}
