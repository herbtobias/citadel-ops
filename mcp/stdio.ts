#!/usr/bin/env node
// Citadel Ops — MCP stdio entry. Run by local Claude Code via `.mcp.json`.
// Config: CITADEL_URL (default http://localhost:3000) plus a credential —
//   CITADEL_TOKEN   = a provisioning key; the agent mints a short-lived session license
//                     via citadel_acquire_license (recommended — one durable secret per
//                     operator, set once, shared by every agent). §C
//   CITADEL_LICENSE = a static agent key (classic mode; back-compatible).
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createCitadelServer } from './citadel'

const baseUrl = process.env.CITADEL_URL || 'http://localhost:3000'
const license = process.env.CITADEL_LICENSE
const provisioningKey = process.env.CITADEL_TOKEN

if (!license && !provisioningKey) {
  console.error(
    'Set CITADEL_TOKEN (provisioning key, recommended) or CITADEL_LICENSE (static agent key).',
  )
  process.exit(1)
}

const server = createCitadelServer({ baseUrl, license, provisioningKey })
const transport = new StdioServerTransport()

await server.connect(transport)
console.error(
  `citadel MCP (stdio) connected → ${baseUrl} (${provisioningKey ? 'provisioning/acquire' : 'static license'})`,
)
