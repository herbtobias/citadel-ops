#!/usr/bin/env node
// Citadel Ops — MCP stdio entry. Run by local Claude Code via `.mcp.json`.
// Config: CITADEL_URL (default http://localhost:3000) + CITADEL_LICENSE (lic_…).
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createCitadelServer } from './citadel'

const baseUrl = process.env.CITADEL_URL || 'http://localhost:3000'
const license = process.env.CITADEL_LICENSE

if (!license) {
  console.error('CITADEL_LICENSE is required (the agent Bearer key, e.g. lic_…)')
  process.exit(1)
}

const server = createCitadelServer({ baseUrl, license })
const transport = new StdioServerTransport()

await server.connect(transport)
console.error(`citadel MCP (stdio) connected → ${baseUrl}`)
