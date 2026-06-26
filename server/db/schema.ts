// Citadel Ops — Postgres schema (Drizzle ORM). Mirrors §8 of the concept.
// Casing is configured to snake_case in drizzle.config.ts, so camelCase fields
// map to snake_case columns automatically.
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ─── Enums ────────────────────────────────────────────────────────────────
export const systemRole = pgEnum('system_role', ['super_admin', 'user'])
export const orgRole = pgEnum('org_role', ['manager', 'contributor', 'viewer'])
export const membershipStatus = pgEnum('membership_status', ['active', 'invited', 'suspended'])
export const invitationStatus = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'expired',
  'revoked',
])
export const licenseStatus = pgEnum('license_status', ['active', 'revoked', 'expired'])
export const sectorEnum = pgEnum('sector', [
  'FRONTEND',
  'BACKEND',
  'QA',
  'INFRA',
  'SECURITY',
  'DESIGN',
])
export const missionType = pgEnum('mission_type', [
  'design',
  'feature',
  'test',
  'bugfix',
  'spike',
  'chore',
  'research',
])
export const missionStatus = pgEnum('mission_status', [
  'backlog',
  'designing',
  'cold_read',
  'ready',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'cancelled',
])
export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high', 'urgent'])
export const operationStatus = pgEnum('operation_status', [
  'planned',
  'active',
  'completed',
  'archived',
])
export const linkType = pgEnum('link_type', [
  'spawned_from',
  'spawns',
  'tests',
  'tested_by',
  'fixes',
  'fixed_by',
  'blocks',
  'blocked_by',
  'relates_to',
  'duplicates',
  'part_of',
  'follow_up_of',
])
export const refKind = pgEnum('ref_kind', ['mission', 'operation'])
export const artifactKind = pgEnum('artifact_kind', ['pr', 'commit', 'file', 'url', 'test_report'])
export const dossierStatus = pgEnum('dossier_status', [
  'draft',
  'cold_read_passed',
  'cold_read_failed',
  'archived',
])
export const coldReadVerdict = pgEnum('cold_read_verdict', ['pass', 'fail'])
export const missionResult = pgEnum('mission_result', ['success', 'failed'])
export const actorType = pgEnum('actor_type', ['agent', 'human', 'system'])
export const orderType = pgEnum('order_type', [
  'pause',
  'resume',
  'stand_down',
  'reprioritize',
  'redirect',
  'message',
])
export const notificationType = pgEnum('notification_type', [
  'review_requested',
  'blocked',
  'budget_exceeded',
  'lease_expired',
  'handed_off',
  'cold_read_failed',
  'archive_updated',
])
export const errorLevel = pgEnum('error_level', ['error', 'fatal'])
export const errorSource = pgEnum('error_source', ['frontend', 'api', 'mcp', 'runner'])
export const runnerStatus = pgEnum('runner_status', [
  'idle',
  'running',
  'succeeded',
  'failed',
  'cancelled',
])

// ─── Project settings (jsonb shape) ───────────────────────────────────────
export type ProjectSettings = {
  wipLimits?: Record<string, number>
  statusColumns: string[]
  sectors: string[]
  coldReadRequired: boolean
  activeThemeKey: string
  maxHandoffDepth: number
  maxMissionsPerAgent: number
  rateLimits?: { callsPerMin?: number }
}

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}

// ─── Platform: Users & Organizations ──────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  systemRole: systemRole('system_role').notNull().default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Single-use password-reset tokens (§22). Only the SHA-256 hash is stored, never the
// token itself; entries expire and are marked used on redemption.
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const orgMemberships = pgTable(
  'org_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: orgRole('role').notNull().default('contributor'),
    status: membershipStatus('status').notNull().default('active'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('org_membership_unique').on(t.orgId, t.userId)],
)

export const projectMemberships = pgTable(
  'project_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    grantedByUserId: uuid('granted_by_user_id').references(() => users.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('project_membership_unique').on(t.projectId, t.userId)],
)

export const invitations = pgTable('invitations', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  orgRole: orgRole('org_role').notNull().default('contributor'),
  projectIds: uuid('project_ids').array().notNull().default([]),
  token: text('token').notNull().unique(),
  status: invitationStatus('status').notNull().default('pending'),
  invitedByUserId: uuid('invited_by_user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Licenses (The M Desk) ────────────────────────────────────────────────
export const licenses = pgTable(
  'licenses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    agentAlias: text('agent_alias').notNull(),
    hashedKey: text('hashed_key').notNull(),
    sectors: sectorEnum('sectors').array().notNull().default([]),
    scopes: text('scopes').array().notNull().default([]),
    status: licenseStatus('status').notNull().default('active'),
    issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => users.id),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (t) => [index('license_status_idx').on(t.status), index('license_project_idx').on(t.projectId)],
)

// ─── Projects & Repositories ──────────────────────────────────────────────
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    settings: jsonb('settings').$type<ProjectSettings>().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('project_key_unique').on(t.orgId, t.key)],
)

export const repositories = pgTable('repositories', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  gitUrl: text('git_url').notNull(),
  defaultBranch: text('default_branch').notNull().default('main'),
  secretRef: text('secret_ref'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Operations (= Sprint) ────────────────────────────────────────────────
export const operations = pgTable(
  'operations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    codename: text('codename').notNull(),
    objective: text('objective').notNull().default(''),
    status: operationStatus('status').notNull().default('planned'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    capacityPoints: integer('capacity_points'),
    sectorsInScope: sectorEnum('sectors_in_scope').array().notNull().default([]),
    briefingSummary: text('briefing_summary').notNull().default(''),
    successCriteria: text('success_criteria').array().notNull().default([]),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex('operation_key_unique').on(t.projectId, t.key)],
)

// ─── Missions (= Task) ────────────────────────────────────────────────────
export const missions = pgTable(
  'missions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    operationId: uuid('operation_id').references(() => operations.id, { onDelete: 'set null' }),
    key: text('key').notNull(),
    codename: text('codename'),
    title: text('title').notNull(),
    objective: text('objective').notNull().default(''),
    briefing: text('briefing').notNull().default(''),
    type: missionType('type').notNull().default('feature'),
    sector: sectorEnum('sector').notNull(),
    requiredSkills: text('required_skills').array().notNull().default([]),
    status: missionStatus('status').notNull().default('backlog'),
    priority: priorityEnum('priority').notNull().default('medium'),
    estimatePoints: integer('estimate_points'),
    orderIndex: integer('order_index').notNull().default(0),
    acceptanceCriteria: text('acceptance_criteria').array().notNull().default([]),
    definitionOfDone: text('definition_of_done'),
    dossierId: uuid('dossier_id'),
    parentId: uuid('parent_id'),
    sharedContext: jsonb('shared_context').$type<Record<string, unknown>>(),
    // Hand-off / loop-guard
    handoffDepth: integer('handoff_depth').notNull().default(0),
    // Claiming / leases (DSPTCH, §21)
    claimedByLicenseId: uuid('claimed_by_license_id').references(() => licenses.id, {
      onDelete: 'set null',
    }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    createdByLicenseId: uuid('created_by_license_id'),
    repositoryId: uuid('repository_id').references(() => repositories.id, { onDelete: 'set null' }),
    branch: text('branch'),
    worktreePath: text('worktree_path'),
    outcome: text('outcome'),
    result: missionResult('result'),
    ...timestamps,
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('mission_key_unique').on(t.projectId, t.key),
    index('mission_status_idx').on(t.projectId, t.status),
    index('mission_claim_idx').on(t.sector, t.status),
  ],
)

// ─── References (generic cross-links) ─────────────────────────────────────
export const references = pgTable(
  'references',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sourceKind: refKind('source_kind').notNull(),
    sourceId: uuid('source_id').notNull(),
    targetKind: refKind('target_kind').notNull(),
    targetId: uuid('target_id').notNull(),
    linkType: linkType('link_type').notNull(),
    note: text('note'),
    createdByLicenseId: uuid('created_by_license_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('reference_source_idx').on(t.sourceKind, t.sourceId),
    index('reference_target_idx').on(t.targetKind, t.targetId),
  ],
)

// ─── The Archive: Dossiers & Knowledge ────────────────────────────────────
export type DossierSections = {
  problem?: string
  background?: string
  technicalPlan?: string
  affectedFiles?: string[]
  rejectedAlternatives?: string
  implementationSteps?: string
  acceptanceCriteria?: string
  risks?: string
  handoffNotes?: string
  references?: string
}

export const dossiers = pgTable('dossiers', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  missionId: uuid('mission_id').references(() => missions.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  version: integer('version').notNull().default(1),
  status: dossierStatus('status').notNull().default('draft'),
  sections: jsonb('sections').$type<DossierSections>().notNull().default({}),
  affectedFiles: text('affected_files').array().notNull().default([]),
  coldRead: jsonb('cold_read').$type<{
    verdict?: string
    recruitLicenseId?: string
    comprehensionNotes?: string
    openQuestions?: string[]
  }>(),
  ...timestamps,
})

export const knowledgeDocs = pgTable('knowledge_docs', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  level: integer('level').notNull().default(0),
  summary: text('summary').notNull().default(''),
  bodyMarkdown: text('body_markdown').notNull().default(''),
  parentId: uuid('parent_id'),
  ...timestamps,
})

export const coldReadChecks = pgTable('cold_read_checks', {
  id: uuid('id').defaultRandom().primaryKey(),
  dossierId: uuid('dossier_id')
    .notNull()
    .references(() => dossiers.id, { onDelete: 'cascade' }),
  recruitLicenseId: uuid('recruit_license_id'),
  verdict: coldReadVerdict('verdict').notNull(),
  comprehensionNotes: text('comprehension_notes'),
  openQuestions: text('open_questions').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Q-Branch: Gates, Harness, Themes, Guidelines ─────────────────────────
export const qualityGates = pgTable('quality_gates', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  appliesToStatus: missionStatus('applies_to_status').notNull(),
  rule: jsonb('rule')
    .$type<{
      requireArtifacts?: boolean
      requireColdRead?: boolean
      requireAcceptanceChecked?: boolean
      requireHarnessPass?: boolean
    }>()
    .notNull()
    .default({}),
  blocking: boolean('blocking').notNull().default(true),
})

export const harnessDefs = pgTable('harness_defs', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  commands: jsonb('commands')
    .$type<{ build?: string; test?: string; lint?: string; run?: string }>()
    .notNull()
    .default({}),
  env: jsonb('env').$type<Record<string, string>>(),
  notes: text('notes'),
})

export const themes = pgTable('themes', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  tokens: jsonb('tokens').$type<Record<string, unknown>>().notNull().default({}),
  guidelineDocId: uuid('guideline_doc_id'),
  isActive: boolean('is_active').notNull().default(true),
})

export const designGuidelines = pgTable('design_guidelines', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  themeKey: text('theme_key').notNull(),
  title: text('title').notNull(),
  bodyMarkdown: text('body_markdown').notNull().default(''),
  version: integer('version').notNull().default(1),
})

// ─── The Wire: Activity Log (append-only, hash-chained) ───────────────────
export const activityLog = pgTable(
  'activity_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    missionId: uuid('mission_id').references(() => missions.id, { onDelete: 'set null' }),
    operationId: uuid('operation_id').references(() => operations.id, { onDelete: 'set null' }),
    actorType: actorType('actor_type').notNull(),
    actorLicenseId: uuid('actor_license_id'),
    actorUserId: uuid('actor_user_id'),
    event: text('event').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    message: text('message'),
    durationSec: integer('duration_sec'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    traceId: text('trace_id'),
    prevHash: text('prev_hash'),
    hash: text('hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('activity_mission_idx').on(t.missionId), index('activity_trace_idx').on(t.traceId)],
)

// ─── Comments & Artifacts ─────────────────────────────────────────────────
export const comments = pgTable('comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  missionId: uuid('mission_id')
    .notNull()
    .references(() => missions.id, { onDelete: 'cascade' }),
  authorUserId: uuid('author_user_id').references(() => users.id),
  authorLicenseId: uuid('author_license_id'),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const artifacts = pgTable('artifacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  missionId: uuid('mission_id')
    .notNull()
    .references(() => missions.id, { onDelete: 'cascade' }),
  kind: artifactKind('kind').notNull(),
  url: text('url').notNull(),
  label: text('label').notNull(),
  createdByLicenseId: uuid('created_by_license_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Deployments (AgentRun), Orders, Notifications ────────────────────────
export const deployments = pgTable('deployments', {
  id: uuid('id').defaultRandom().primaryKey(),
  missionId: uuid('mission_id')
    .notNull()
    .references(() => missions.id, { onDelete: 'cascade' }),
  licenseId: uuid('license_id').references(() => licenses.id, { onDelete: 'set null' }),
  runnerStatus: runnerStatus('runner_status').notNull().default('idle'),
  tokenBudget: integer('token_budget'),
  tokensSpent: integer('tokens_spent').notNull().default(0),
  costBudget: integer('cost_budget'),
  costSpent: integer('cost_spent').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
})

export const controlOrders = pgTable('control_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  type: orderType('type').notNull(),
  targetLicenseId: uuid('target_license_id'),
  targetSector: sectorEnum('target_sector'),
  broadcast: boolean('broadcast').notNull().default(false),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  issuedByUserId: uuid('issued_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  type: notificationType('type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Hardening & Monitoring stubs ─────────────────────────────────────────
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text('key').notNull(),
    scope: text('scope').notNull(),
    resultRef: text('result_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('idempotency_unique').on(t.key, t.scope)],
)

export const errorEvents = pgTable(
  'error_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    traceId: text('trace_id'),
    orgId: uuid('org_id'),
    projectId: uuid('project_id'),
    missionId: uuid('mission_id'),
    deploymentId: uuid('deployment_id'),
    level: errorLevel('level').notNull().default('error'),
    source: errorSource('source').notNull(),
    message: text('message').notNull(),
    stack: text('stack'),
    context: jsonb('context').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('error_trace_idx').on(t.traceId)],
)

export const webhookSubscriptions = pgTable('webhook_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  events: text('events').array().notNull().default([]),
  secret: text('secret'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => webhookSubscriptions.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),
    ok: boolean('ok').notNull().default(false),
    statusCode: integer('status_code'),
    attempts: integer('attempts').notNull().default(1),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('webhook_delivery_sub_idx').on(t.subscriptionId)],
)

// ─── Relations (used by the API for joins) ────────────────────────────────
export const projectsRelations = relations(projects, ({ many, one }) => ({
  organization: one(organizations, { fields: [projects.orgId], references: [organizations.id] }),
  operations: many(operations),
  missions: many(missions),
}))

export const operationsRelations = relations(operations, ({ one, many }) => ({
  project: one(projects, { fields: [operations.projectId], references: [projects.id] }),
  missions: many(missions),
}))

export const missionsRelations = relations(missions, ({ one, many }) => ({
  project: one(projects, { fields: [missions.projectId], references: [projects.id] }),
  operation: one(operations, { fields: [missions.operationId], references: [operations.id] }),
  claimedBy: one(licenses, { fields: [missions.claimedByLicenseId], references: [licenses.id] }),
  artifacts: many(artifacts),
  comments: many(comments),
}))

export const licensesRelations = relations(licenses, ({ one }) => ({
  organization: one(organizations, { fields: [licenses.orgId], references: [organizations.id] }),
  project: one(projects, { fields: [licenses.projectId], references: [projects.id] }),
}))
