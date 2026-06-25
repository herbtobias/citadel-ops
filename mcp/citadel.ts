// Citadel Ops — MCP server `citadel`. A thin wrapper that maps citadel_* tools onto
// the Nitro REST API (the source of truth), authenticated with the agent's License.
// Used by both transports: stdio (local Claude Code) and streamable-HTTP (/api/mcp). §11.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

export interface CitadelClientOpts {
  baseUrl: string
  license: string
}

// REST client bound to one License. Caches the license's projectId (from check-in).
export function makeCitadelClient({ baseUrl, license }: CitadelClientOpts) {
  let projectId: string | null = null

  async function api(path: string, opts: { method?: string, body?: unknown } = {}) {
    const res = await fetch(baseUrl + path, {
      method: opts.method ?? 'GET',
      headers: { Authorization: `Bearer ${license}`, 'content-type': 'application/json' },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
    const text = await res.text()
    const data = text ? JSON.parse(text) : null
    if (!res.ok) throw new Error(`${res.status} ${data?.statusMessage || data?.message || text}`)
    return data
  }

  async function pid(): Promise<string> {
    if (!projectId) {
      const ci = await api('/api/v1/agent/check-in', { method: 'POST' })
      projectId = ci?.project?.id ?? null
    }
    if (!projectId) throw new Error('License is not bound to a project')
    return projectId
  }

  return { api, pid }
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
  ) => server.registerTool(name, { description, inputSchema: shape }, async (args: any) => {
    try { return ok(await handler(args ?? {})) }
    catch (e: any) { return { isError: true, content: [{ type: 'text' as const, text: String(e?.message ?? e) }] } }
  })

  // ── Onboarding & intel ──
  t('citadel_acquire_license', 'Check in the License and get the agent context (alias, sectors, project).', {},
    () => client.api('/api/v1/agent/check-in', { method: 'POST' }))

  t('citadel_get_briefing', 'Fetch the layered project Briefing (vision, active operation, Q-equipment, Archive).',
    { operation: z.string().optional() },
    async ({ operation }) => client.api(`/api/v1/projects/${await client.pid()}/briefing${operation ? `?operation=${operation}` : ''}`))

  t('citadel_get_quality_gates', 'List the project Quality Gates.', {},
    async () => client.api(`/api/v1/projects/${await client.pid()}/quality-gates`))

  t('citadel_get_harness', 'List the Harness Definitions (build/test/lint commands).', {},
    async () => client.api(`/api/v1/projects/${await client.pid()}/harness`))

  t('citadel_get_design_guidelines', 'Get the Design Guideline + theme registry for the active (or named) theme.',
    { theme: z.string().optional() },
    async ({ theme }) => client.api(`/api/v1/projects/${await client.pid()}/design-guidelines?theme=${theme ?? 'active'}`))

  // ── Orders & work ──
  t('citadel_check_orders', 'Check for unconsumed control orders (pause/stand_down/redirect). standDown=true means stop.', {},
    () => client.api('/api/v1/agent/orders'))

  t('citadel_claim_next_mission', 'Atomically claim the next ready mission in your sector(s).', {},
    () => client.api('/api/v1/agent/claim-next', { method: 'POST' }))

  t('citadel_get_mission', 'Get a mission by id.', { missionId: z.string() },
    ({ missionId }) => client.api(`/api/v1/missions/${missionId}`))

  t('citadel_list_missions', 'List all missions in the project.', {},
    async () => client.api(`/api/v1/projects/${await client.pid()}/missions`))

  // ── EGM ──
  t('citadel_file_dossier', 'File a design dossier for a mission (moves designing→cold_read).',
    {
      missionId: z.string(),
      title: z.string(),
      sections: z.record(z.string(), z.string()).optional(),
      affectedFiles: z.array(z.string()).optional(),
    },
    ({ missionId, ...body }) => client.api(`/api/v1/missions/${missionId}/dossier`, { method: 'POST', body }))

  t('citadel_run_cold_read', 'Submit a Cold Read verdict as a zero-context Recruit (pass→ready, fail→designing).',
    {
      dossierId: z.string(),
      verdict: z.enum(['pass', 'fail']),
      comprehensionNotes: z.string().optional(),
      openQuestions: z.array(z.string()).optional(),
    },
    ({ dossierId, ...body }) => client.api(`/api/v1/dossiers/${dossierId}/cold-read`, { method: 'POST', body }))

  // ── Hand-off & collaboration ──
  t('citadel_hand_off_mission', 'Hand off a new mission in another sector with shared context + a typed reference.',
    {
      missionId: z.string(),
      sector: z.enum(['FRONTEND', 'BACKEND', 'QA', 'INFRA', 'SECURITY', 'DESIGN']),
      type: z.enum(['design', 'feature', 'test', 'bugfix', 'spike', 'chore', 'research']),
      title: z.string(),
      objective: z.string().optional(),
      briefing: z.string().optional(),
      linkType: z.enum(['tests', 'fixes', 'blocks', 'relates_to', 'follow_up_of', 'duplicates']).optional(),
      note: z.string().optional(),
    },
    ({ missionId, ...body }) => client.api(`/api/v1/agent/missions/${missionId}/hand-off`, { method: 'POST', body }))

  t('citadel_attach_artifact', 'Attach an artifact (pr/commit/file/url/test_report). test_report satisfies the harness gate.',
    {
      missionId: z.string(),
      kind: z.enum(['pr', 'commit', 'file', 'url', 'test_report']),
      url: z.string(),
      label: z.string(),
    },
    ({ missionId, ...body }) => client.api(`/api/v1/agent/missions/${missionId}/artifacts`, { method: 'POST', body }))

  t('citadel_add_comment', 'Add a comment / work-log entry to a mission.',
    { missionId: z.string(), body: z.string() },
    ({ missionId, body }) => client.api(`/api/v1/agent/missions/${missionId}/comments`, { method: 'POST', body: { body } }))

  // ── Lifecycle ──
  t('citadel_report_blocker', 'Report a blocker on a claimed mission (→ blocked).',
    { missionId: z.string(), reason: z.string() },
    ({ missionId, reason }) => client.api(`/api/v1/agent/missions/${missionId}/block`, { method: 'POST', body: { reason } }))

  t('citadel_submit_for_review', 'Submit a claimed mission for review (→ in_review, non-blocking).',
    { missionId: z.string() },
    ({ missionId }) => client.api(`/api/v1/agent/missions/${missionId}/submit`, { method: 'POST' }))

  t('citadel_heartbeat', 'Extend the lease on a claimed mission.',
    { missionId: z.string() },
    ({ missionId }) => client.api(`/api/v1/agent/missions/${missionId}/heartbeat`, { method: 'POST' }))

  t('citadel_complete_mission', 'Complete a claimed mission (enforces Q-gates; → done).',
    { missionId: z.string(), result: z.enum(['success', 'failed']).optional(), outcome: z.string().optional() },
    ({ missionId, ...body }) => client.api(`/api/v1/agent/missions/${missionId}/complete`, { method: 'POST', body }))
}

// Builds a fully-wired MCP server for one License.
export function createCitadelServer(opts: CitadelClientOpts): McpServer {
  const server = new McpServer({ name: 'citadel', version: '0.1.0' })
  registerCitadelTools(server, makeCitadelClient(opts))
  return server
}
