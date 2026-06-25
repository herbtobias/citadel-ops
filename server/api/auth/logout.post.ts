// POST /api/auth/logout — clears the session cookie.
export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  return { ok: true }
})
