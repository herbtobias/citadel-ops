import { describe, expect, it } from 'vitest'
import { listCitadelTools } from '../mcp-util'

// The §11 tool surface. Keep this in lockstep with mcp/citadel.ts.
const EXPECTED_TOOLS = [
  'citadel_acquire_license',
  'citadel_get_briefing',
  'citadel_read_archive',
  'citadel_write_knowledge',
  'citadel_get_quality_gates',
  'citadel_get_harness',
  'citadel_get_design_guidelines',
  'citadel_check_orders',
  'citadel_claim_next_mission',
  'citadel_get_mission',
  'citadel_list_missions',
  'citadel_plan_operation',
  'citadel_create_mission',
  'citadel_update_mission',
  'citadel_link_missions',
  'citadel_file_dossier',
  'citadel_run_cold_read',
  'citadel_hand_off_mission',
  'citadel_attach_artifact',
  'citadel_add_comment',
  'citadel_report_blocker',
  'citadel_submit_for_review',
  'citadel_heartbeat',
  'citadel_complete_mission',
].sort()

describe('MCP server: citadel tool surface', () => {
  it('exposes exactly the expected tool set', async () => {
    const names = (await listCitadelTools()).map((t) => t.name).sort()
    expect(names).toEqual(EXPECTED_TOOLS)
  })

  it('every tool has a description and an object input schema', async () => {
    const tools = await listCitadelTools()
    for (const t of tools) {
      expect(t.description, `${t.name} needs a description`).toBeTruthy()
      expect(t.inputSchema?.type).toBe('object')
    }
  })

  it('declares the right required parameters for key tools', async () => {
    const tools = await listCitadelTools()
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]))

    expect(byName.citadel_get_mission.inputSchema.required).toContain('missionId')
    expect(byName.citadel_hand_off_mission.inputSchema.required).toEqual(
      expect.arrayContaining(['sector', 'type', 'title']),
    )
    expect(byName.citadel_run_cold_read.inputSchema.required).toEqual(
      expect.arrayContaining(['dossierId', 'verdict']),
    )
    expect(byName.citadel_create_mission.inputSchema.required).toEqual(
      expect.arrayContaining(['title', 'sector']),
    )
    expect(byName.citadel_link_missions.inputSchema.required).toEqual(
      expect.arrayContaining(['sourceKey', 'targetKey', 'linkType']),
    )
    expect(byName.citadel_plan_operation.inputSchema.required).toContain('codename')
    // acquire_license takes no required args
    expect(byName.citadel_acquire_license.inputSchema.required ?? []).toHaveLength(0)
  })
})
