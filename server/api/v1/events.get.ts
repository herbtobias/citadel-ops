// GET /api/v1/events?projectId=… — Server-Sent Events stream of live activity for a
// project (§13). Drives the live board/situation room. Session-authenticated.
import { assertProjectAccess } from '~~/server/utils/auth'
import { subscribeEvents } from '~~/server/utils/events'

export default defineEventHandler(async (event) => {
  const projectId = getQuery(event).projectId as string | undefined
  if (!projectId) throw createError({ statusCode: 400, statusMessage: 'projectId query param required' })
  await assertProjectAccess(event, projectId)

  const stream = createEventStream(event)
  const unsubscribe = subscribeEvents((e) => {
    if (e.projectId === projectId) stream.push(JSON.stringify(e))
  })

  // Initial hello so clients know the stream is open.
  stream.push(JSON.stringify({ type: 'connected', projectId, ts: Date.now() }))

  stream.onClosed(async () => {
    unsubscribe()
    await stream.close()
  })

  return stream.send()
})
