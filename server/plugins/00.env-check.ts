// Citadel Ops — startup environment guard. Fails fast in production if critical
// secrets are missing, so the app never boots with an empty/weak session password
// (which would silently weaken every user session). Dev only warns. §22.
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const isProd = process.env.NODE_ENV === 'production'
  const pw = config.session?.password ?? ''
  // Read the same source the DB connection uses (server/db/index.ts) — the bare
  // DATABASE_URL env var, set at runtime. runtimeConfig.databaseUrl is only the
  // build-time default and is NOT overridden by DATABASE_URL at runtime (Nuxt maps
  // only NUXT_-prefixed env vars), so checking it would false-fail in Docker.
  const dbUrl = process.env.DATABASE_URL || config.databaseUrl || ''

  const problems: string[] = []
  if (pw.length < 32) problems.push('NUXT_SESSION_PASSWORD must be set to ≥32 chars')
  if (!dbUrl) problems.push('DATABASE_URL must be set')
  // §HORIZON M1 — the Redis backplane is mandatory in production (event fan-out + distributed
  // rate limits are wrong across instances without it). No silent in-process fallback in prod.
  if (!process.env.REDIS_URL) problems.push('REDIS_URL must be set (Redis backplane)')

  if (problems.length === 0) return

  const msg = `Citadel env check failed:\n  - ${problems.join('\n  - ')}`
  if (isProd) throw new Error(msg)
  // eslint-disable-next-line no-console
  console.warn(`⚠ ${msg}\n  (allowed in dev; this is a hard error in production)`)
})
