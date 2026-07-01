// Citadel Ops — MCP server `citadel`. A thin wrapper that maps citadel_* tools onto
// the Nitro REST API (the source of truth), authenticated with the agent's License.
// Used by both transports: stdio (local Claude Code) and streamable-HTTP (/api/mcp). §11.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

const sectorEnum = z.enum(['FRONTEND', 'BACKEND', 'QA', 'INFRA', 'SECURITY', 'DESIGN'])

export interface CitadelClientOpts {
  baseUrl: string
  // A static standing/session key (classic mode), the provisioning key for the acquire
  // handshake (§C), or both. At least one is required.
  license?: string
  provisioningKey?: string
}

// REST client for one agent session. In classic mode it's bound to a static `license`.
// With a `provisioningKey` it holds no work credential until `acquire()` mints a session
// license (held in memory, never surfaced to the model). Caches the projectId.
export function makeCitadelClient({ baseUrl, license, provisioningKey }: CitadelClientOpts) {
  let projectId: string | null = null
  let sessionKey: string | null = license ?? null

  async function call(token: string, path: string, opts: { method?: string; body?: unknown } = {}) {
    const res = await fetch(baseUrl + path, {
      method: opts.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
    const text = await res.text()
    const data = text ? JSON.parse(text) : null
    if (!res.ok) throw new Error(`${res.status} ${data?.statusMessage || data?.message || text}`)
    return data
  }

  // Authenticated with the session license. Every work tool goes through here.
  async function api(path: string, opts: { method?: string; body?: unknown } = {}) {
    if (!sessionKey) {
      throw new Error(
        provisioningKey
          ? 'No active session license — call citadel_acquire_license first.'
          : 'No license configured (set CITADEL_TOKEN or CITADEL_LICENSE).',
      )
    }
    return call(sessionKey, path, opts)
  }

  // The acquire handshake. With a provisioning key, mints a session license and adopts
  // it. In classic mode there's nothing to mint — just check in the static license.
  async function acquire(body: Record<string, unknown>) {
    if (!provisioningKey) return api('/api/v1/agent/check-in', { method: 'POST' })
    const res = await call(provisioningKey, '/api/v1/agent/acquire', { method: 'POST', body })
    sessionKey = res.key
    projectId = res?.project?.id ?? null
    const { key: _key, ...context } = res // never surface the raw key to the model
    return context
  }

  async function pid(): Promise<string> {
    if (!projectId) {
      const ci = await api('/api/v1/agent/check-in', { method: 'POST' })
      projectId = ci?.project?.id ?? null
    }
    if (!projectId) throw new Error('License is not bound to a project')
    return projectId
  }

  return { api, pid, acquire }
}

type Client = ReturnType<typeof makeCitadelClient>

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

// Registers all citadel_* tools on the server, backed by the given client.
export function registerCitadelTools(server: McpServer, client: Client) {
  const t = (
    name: string,
    description: string,
    shape: z.ZodRawShape,
    handler: (args: any) => Promise<unknown>,
  ) =>
    server.registerTool(name, { description, inputSchema: shape }, async (args: any) => {
      try {
        return ok(await handler(args ?? {}))
      } catch (e: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: String(e?.message ?? e) }],
        }
      }
    })

  // ── Onboarding & intel ──
  t(
    'citadel_acquire_license',
    'Start the session: acquire a short-lived, sector-scoped session license (the acquire ' +
      'handshake) and get the agent context (alias, sectors, scopes, project). With a ' +
      'provisioning key configured this mints a fresh session license; with a static license ' +
      'it just checks in. Call this ONCE before any other tool. Pass `sectors`/`scopes` to ' +
      'scope this agent (defaults to the provisioning key’s ceiling).',
    {
      sectors: z.array(sectorEnum).optional(),
      scopes: z.array(z.enum(['plan', 'recon'])).optional(),
      alias: z.string().optional(),
      ttlMinutes: z.number().int().positive().optional(),
    },
    (args) => client.acquire(args),
  )

  t(
    'citadel_get_briefing',
    'Fetch the layered project Briefing (vision, active operation, Q-equipment, Archive).',
    { operation: z.string().optional() },
    async ({ operation }) =>
      client.api(
        `/api/v1/projects/${await client.pid()}/briefing${operation ? `?operation=${operation}` : ''}`,
      ),
  )

  // ── Brownfield onboarding (Scout · Interrogator) — requires the `recon` scope ──
  t(
    'citadel_read_archive',
    'Read the full Archive (all KnowledgeDocs incl. bodyMarkdown) for the project. ' +
      'Use before planning a brownfield project to see what the Scout/Interrogator filed.',
    {},
    () => client.api('/api/v1/agent/knowledge'),
  )

  t(
    'citadel_write_knowledge',
    'Write a KnowledgeDoc into The Archive (Scout repo-recon / Interrogator debrief). ' +
      'Upserted per path; nest with parentPath. Requires the `recon` scope. Writes land ' +
      'QUARANTINED — a fact only reaches Briefings after a foreign actor or HQ certifies it.',
    {
      path: z.string(),
      summary: z.string(),
      bodyMarkdown: z.string().optional(),
      level: z.number().int().min(0).max(10).optional(),
      parentPath: z.string().optional(),
    },
    (body) => client.api('/api/v1/agent/knowledge', { method: 'POST', body }),
  )

  t(
    'citadel_verify_knowledge',
    'Fakten-Cold-Read: certify or reject a quarantined KnowledgeDoc so it can (or can never) ' +
      'reach a Briefing. Zero-context rule — you may NOT verify a doc your own License wrote. ' +
      'reject requires a `reason`. Needs the doc id (from citadel_read_archive is certified-only; ' +
      'a validator gets ids from HQ).',
    {
      docId: z.string(),
      verdict: z.enum(['certify', 'reject']),
      notes: z.string().optional(),
      reason: z.string().optional(),
    },
    ({ docId, ...body }) =>
      client.api(`/api/v1/knowledge/${docId}/verify`, { method: 'POST', body }),
  )

  t(
    'citadel_delete_knowledge',
    'Retract a KnowledgeDoc from The Archive by path (e.g. a stale recon doc or an ' +
      'INTEL/* entry the operator asked to remove). Requires the `recon` scope.',
    { path: z.string() },
    ({ path }) =>
      client.api(`/api/v1/agent/knowledge?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
  )

  t(
    'citadel_finish_recon',
    'Signal the end of a recon run after filing KnowledgeDocs. Raises ONE Archive-updated ' +
      'notification for HQ (instead of a bell per doc). Call it once when done. Requires `recon`.',
    {},
    () => client.api('/api/v1/agent/knowledge/finish', { method: 'POST', body: {} }),
  )

  t('citadel_get_quality_gates', 'List the project Quality Gates.', {}, async () =>
    client.api(`/api/v1/projects/${await client.pid()}/quality-gates`),
  )

  t(
    'citadel_get_harness',
    'List the Harness Definitions (build/test/lint commands).',
    {},
    async () => client.api(`/api/v1/projects/${await client.pid()}/harness`),
  )

  t(
    'citadel_get_design_guidelines',
    'Get the Design Guideline + theme registry for the active (or named) theme.',
    { theme: z.string().optional() },
    async ({ theme }) =>
      client.api(
        `/api/v1/projects/${await client.pid()}/design-guidelines?theme=${theme ?? 'active'}`,
      ),
  )

  // ── Orders & work ──
  t(
    'citadel_check_orders',
    'Check for unconsumed control orders (pause/stand_down/redirect). standDown=true means stop.',
    {},
    () => client.api('/api/v1/agent/orders'),
  )

  t(
    'citadel_claim_next_mission',
    'Atomically claim the next ready mission in your sector(s).',
    {},
    () => client.api('/api/v1/agent/claim-next', { method: 'POST' }),
  )

  t('citadel_get_mission', 'Get a mission by id.', { missionId: z.string() }, ({ missionId }) =>
    client.api(`/api/v1/missions/${missionId}`),
  )

  t('citadel_list_missions', 'List all missions in the project.', {}, async () =>
    client.api(`/api/v1/projects/${await client.pid()}/missions`),
  )

  // ── Planning (requires the `plan` scope on your License) ──
  t(
    'citadel_plan_operation',
    'Plan an Operation (sprint). Created `planned`, or `active` if activate=true. Requires the `plan` scope.',
    {
      codename: z.string(),
      objective: z.string().optional(),
      sectorsInScope: z
        .array(z.enum(['FRONTEND', 'BACKEND', 'QA', 'INFRA', 'SECURITY', 'DESIGN']))
        .optional(),
      capacityPoints: z.number().int().positive().nullable().optional(),
      successCriteria: z.array(z.string()).optional(),
      activate: z.boolean().optional(),
    },
    (body) => client.api('/api/v1/agent/operations', { method: 'POST', body }),
  )

  t(
    'citadel_create_mission',
    'Create a Mission in the backlog (or `ready`). Attach to an Operation/parent by key (OP-1 / WEB-42). Requires the `plan` scope.',
    {
      title: z.string(),
      sector: z.enum(['FRONTEND', 'BACKEND', 'QA', 'INFRA', 'SECURITY', 'DESIGN']),
      type: z
        .enum(['design', 'feature', 'test', 'bugfix', 'spike', 'chore', 'research'])
        .optional(),
      objective: z.string().optional(),
      briefing: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      estimatePoints: z.number().int().positive().nullable().optional(),
      acceptanceCriteria: z.array(z.string()).optional(),
      requiredSkills: z.array(z.string()).optional(),
      operationKey: z.string().optional(),
      parentKey: z.string().optional(),
      status: z.enum(['backlog', 'ready']).optional(),
    },
    (body) => client.api('/api/v1/agent/missions', { method: 'POST', body }),
  )

  t(
    'citadel_update_mission',
    'Groom an existing Mission (title/objective/priority/estimate/sector/operation by key, …). Not status. Requires the `plan` scope.',
    {
      mission: z.string().describe('mission id or key (WEB-42)'),
      title: z.string().optional(),
      objective: z.string().optional(),
      briefing: z.string().optional(),
      type: z
        .enum(['design', 'feature', 'test', 'bugfix', 'spike', 'chore', 'research'])
        .optional(),
      sector: z.enum(['FRONTEND', 'BACKEND', 'QA', 'INFRA', 'SECURITY', 'DESIGN']).optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      estimatePoints: z.number().int().positive().nullable().optional(),
      acceptanceCriteria: z.array(z.string()).optional(),
      requiredSkills: z.array(z.string()).optional(),
      orderIndex: z.number().int().optional(),
      operationKey: z.string().nullable().optional(),
    },
    ({ mission, ...body }) =>
      client.api(`/api/v1/agent/missions/${mission}`, { method: 'PATCH', body }),
  )

  t(
    'citadel_link_missions',
    'Link two missions by key with a typed, bidirectional reference. Requires the `plan` scope.',
    {
      sourceKey: z.string(),
      targetKey: z.string(),
      linkType: z.enum([
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
      ]),
    },
    (body) => client.api('/api/v1/agent/links', { method: 'POST', body }),
  )

  t(
    'citadel_propose_quality_gate',
    'Propose a Quality Gate derived from the requirements (Planner). It lands PENDING and does ' +
      'NOT enforce until a manager activates it in HQ (M’s Desk / Q-Branch). Requires the `plan` scope.',
    {
      key: z.string().describe('lowercase-dashed id, unique per project (e.g. review-gate)'),
      name: z.string(),
      appliesToStatus: z.enum([
        'backlog',
        'designing',
        'cold_read',
        'ready',
        'in_progress',
        'in_review',
        'blocked',
        'done',
        'cancelled',
      ]),
      rule: z
        .object({
          requireArtifacts: z.boolean().optional(),
          requireColdRead: z.boolean().optional(),
          requireAcceptanceChecked: z.boolean().optional(),
          requireHarnessPass: z.boolean().optional(),
        })
        .optional(),
      blocking: z.boolean().optional(),
    },
    (body) => client.api('/api/v1/agent/quality-gates', { method: 'POST', body }),
  )

  // ── The Archive & Cold Read ──
  t(
    'citadel_file_dossier',
    'File a design dossier for a mission (moves designing→cold_read).',
    {
      missionId: z.string(),
      title: z.string(),
      sections: z.record(z.string(), z.string()).optional(),
      affectedFiles: z.array(z.string()).optional(),
    },
    ({ missionId, ...body }) =>
      client.api(`/api/v1/missions/${missionId}/dossier`, { method: 'POST', body }),
  )

  t(
    'citadel_run_cold_read',
    'Submit a Cold Read verdict as a zero-context Recruit (pass→ready, fail→designing).',
    {
      dossierId: z.string(),
      verdict: z.enum(['pass', 'fail']),
      comprehensionNotes: z.string().optional(),
      openQuestions: z.array(z.string()).optional(),
    },
    ({ dossierId, ...body }) =>
      client.api(`/api/v1/dossiers/${dossierId}/cold-read`, { method: 'POST', body }),
  )

  // ── Hand-off & collaboration ──
  t(
    'citadel_hand_off_mission',
    'Hand off a new mission in another sector with shared context + a typed reference.',
    {
      missionId: z.string(),
      sector: z.enum(['FRONTEND', 'BACKEND', 'QA', 'INFRA', 'SECURITY', 'DESIGN']),
      type: z.enum(['design', 'feature', 'test', 'bugfix', 'spike', 'chore', 'research']),
      title: z.string(),
      objective: z.string().optional(),
      briefing: z.string().optional(),
      linkType: z
        .enum(['tests', 'fixes', 'blocks', 'relates_to', 'follow_up_of', 'duplicates'])
        .optional(),
      note: z.string().optional(),
    },
    ({ missionId, ...body }) =>
      client.api(`/api/v1/agent/missions/${missionId}/hand-off`, { method: 'POST', body }),
  )

  t(
    'citadel_attach_artifact',
    'Attach an artifact (pr/commit/file/url/test_report). test_report satisfies the harness gate.',
    {
      missionId: z.string(),
      kind: z.enum(['pr', 'commit', 'file', 'url', 'test_report']),
      url: z.string(),
      label: z.string(),
    },
    ({ missionId, ...body }) =>
      client.api(`/api/v1/agent/missions/${missionId}/artifacts`, { method: 'POST', body }),
  )

  t(
    'citadel_add_comment',
    'Add a comment / work-log entry to a mission.',
    { missionId: z.string(), body: z.string() },
    ({ missionId, body }) =>
      client.api(`/api/v1/agent/missions/${missionId}/comments`, {
        method: 'POST',
        body: { body },
      }),
  )

  // ── Lifecycle ──
  t(
    'citadel_report_blocker',
    'Report a blocker on a claimed mission (→ blocked).',
    { missionId: z.string(), reason: z.string() },
    ({ missionId, reason }) =>
      client.api(`/api/v1/agent/missions/${missionId}/block`, { method: 'POST', body: { reason } }),
  )

  t(
    'citadel_request_human_input',
    'Ask HQ a decision and DURABLY suspend the mission (→ waiting_human). Use for genuine ' +
      'ambiguity a human must resolve — not for obstacles (use report_blocker). The lease clock ' +
      'stops (no watchdog re-queue). HQ answers; the mission returns to the backlog and a fresh ' +
      'agent resumes with the answer in the dossier. End your run after calling this.',
    {
      missionId: z.string(),
      question: z.string(),
      context: z.string().optional(),
      urgency: z.enum(['low', 'medium', 'high']).optional(),
      format: z.enum(['free_text', 'yes_no', 'multiple_choice']).optional(),
      choices: z.array(z.string()).optional(),
    },
    ({ missionId, question, context, urgency, format, choices }) =>
      client.api(`/api/v1/agent/missions/${missionId}/request-human-input`, {
        method: 'POST',
        body: { question, context, options: { urgency, format, choices } },
      }),
  )

  t(
    'citadel_submit_for_review',
    'Submit a claimed mission for review (→ in_review, non-blocking).',
    { missionId: z.string() },
    ({ missionId }) => client.api(`/api/v1/agent/missions/${missionId}/submit`, { method: 'POST' }),
  )

  t(
    'citadel_heartbeat',
    'Extend the lease on a claimed mission.',
    { missionId: z.string() },
    ({ missionId }) =>
      client.api(`/api/v1/agent/missions/${missionId}/heartbeat`, { method: 'POST' }),
  )

  t(
    'citadel_complete_mission',
    'Complete a claimed mission (enforces Q-gates; → done).',
    {
      missionId: z.string(),
      result: z.enum(['success', 'failed']).optional(),
      outcome: z.string().optional(),
    },
    ({ missionId, ...body }) =>
      client.api(`/api/v1/agent/missions/${missionId}/complete`, { method: 'POST', body }),
  )
}

// Builds a fully-wired MCP server for one License.
export function createCitadelServer(opts: CitadelClientOpts): McpServer {
  const server = new McpServer({ name: 'citadel', version: '0.1.0' })
  registerCitadelTools(server, makeCitadelClient(opts))
  return server
}
