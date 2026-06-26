// Citadel Ops — Sentry client init (§25). Env-gated via NUXT_PUBLIC_SENTRY_DSN.
// Dynamic import so the SDK stays out of the main bundle unless configured.
export default defineNuxtPlugin(async (nuxtApp) => {
  const dsn = useRuntimeConfig().public.sentryDsn
  if (!dsn) return

  const Sentry = await import('@sentry/vue')
  Sentry.init({
    app: nuxtApp.vueApp,
    dsn,
    environment: import.meta.dev ? 'development' : 'production',
    tracesSampleRate: 0,
  })
})
