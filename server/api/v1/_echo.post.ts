// POST /api/v1/_echo — test sink for webhook deliveries. Echoes the signature header
// and body so the Leiter dispatch path can be verified end-to-end.
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null)
  return { ok: true, signature: getHeader(event, 'x-citadel-signature') ?? null, received: body }
})
