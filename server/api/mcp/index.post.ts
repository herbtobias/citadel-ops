// POST /api/mcp — streamable-HTTP MCP transport (§11). Stateless JSON mode: one
// server per request, authenticated by the agent's License (Authorization: Bearer).
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createCitadelServer } from '~~/mcp/citadel'

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  if (!auth?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, statusMessage: 'Missing license (Bearer token)' })
  }
  const license = auth.slice(7).trim()
  const baseUrl = getRequestURL(event).origin
  const body = await readBody(event)

  const server = createCitadelServer({ baseUrl, license })
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  })

  event.node.res.on('close', () => {
    transport.close()
    server.close()
  })

  await server.connect(transport)
  await transport.handleRequest(event.node.req, event.node.res, body)
  // The transport writes the response directly.
})
