// Citadel Ops — test helper: list the citadel MCP server's tools over an in-memory
// transport (no network/DB — listTools never invokes handlers).
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createCitadelServer } from '../mcp/citadel'

export async function connectInMemory(opts?: { baseUrl?: string, license?: string }) {
  const server = createCitadelServer({ baseUrl: opts?.baseUrl ?? 'http://localhost:0', license: opts?.license ?? 'test' })
  const [clientT, serverT] = InMemoryTransport.createLinkedPair()
  await server.connect(serverT)
  const client = new Client({ name: 'test', version: '1.0.0' })
  await client.connect(clientT)
  return client
}

export async function listCitadelTools() {
  const client = await connectInMemory()
  const { tools } = await client.listTools()
  await client.close()
  return tools
}

export async function listCitadelToolNames(): Promise<string[]> {
  return (await listCitadelTools()).map(t => t.name)
}
