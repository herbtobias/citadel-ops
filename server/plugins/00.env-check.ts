// Citadel Ops — startup environment guard. Fails fast in production if critical
// secrets are missing, so the app never boots with an empty/weak session password
// (which would silently weaken every user session). Dev only warns. §22.
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const isProd = process.env.NODE_ENV === 'production'
  const pw = config.session?.password ?? ''

  const problems: string[] = []
  if (pw.length < 32) problems.push('NUXT_SESSION_PASSWORD must be set to ≥32 chars')
  if (!config.databaseUrl) problems.push('DATABASE_URL must be set')

  if (problems.length === 0) return

  const msg = `Citadel env check failed:\n  - ${problems.join('\n  - ')}`
  if (isProd) throw new Error(msg)
  // eslint-disable-next-line no-console
  console.warn(`⚠ ${msg}\n  (allowed in dev; this is a hard error in production)`)
})
