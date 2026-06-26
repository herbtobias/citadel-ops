import tailwindcss from '@tailwindcss/vite'

// Citadel Ops — Multi-Agent Agile-OS for AI agents.
// Backend (Nitro server/api) is the source of truth; the frontend is the HQ.
export default defineNuxtConfig({
  compatibilityDate: '2026-05-15',
  devtools: { enabled: false },

  modules: [
    '@pinia/nuxt',
    '@nuxtjs/i18n',
    '@nuxt/icon',
    '@nuxt/fonts',
    'nuxt-auth-utils',
    '@nuxt/eslint',
  ],

  // Generate a flat-config preset under .nuxt/ that eslint.config.mjs extends.
  // Stylistic rules are off — Prettier owns formatting.
  eslint: {
    config: {
      stylistic: false,
    },
  },

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  components: [{ path: '~/components', pathPrefix: false }],

  // Theme fonts — both seed themes. Loaded once; the active theme picks via tokens.
  fonts: {
    families: [
      { name: 'Orbitron', provider: 'google', weights: [400, 600, 800, 900] },
      { name: 'Share Tech Mono', provider: 'google', weights: [400] },
      { name: 'JetBrains Mono', provider: 'google', weights: [400, 500, 700] },
      { name: 'Inter Tight', provider: 'google', weights: [400, 500, 600, 700, 800, 900] },
      { name: 'Playfair Display', provider: 'google', weights: [400, 600, 700] },
    ],
  },

  i18n: {
    locales: [
      { code: 'en', file: 'en.json', name: 'English' },
      { code: 'de', file: 'de.json', name: 'Deutsch' },
    ],
    defaultLocale: 'en',
    strategy: 'no_prefix',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_locale',
      fallbackLocale: 'en',
    },
  },

  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL || '',
    session: {
      password: process.env.NUXT_SESSION_PASSWORD || '',
    },
    sentryDsn: process.env.SENTRY_DSN || '',
    public: {
      sentryDsn: process.env.NUXT_PUBLIC_SENTRY_DSN || '',
      appUrl: process.env.NUXT_PUBLIC_APP_URL || '',
    },
  },
})
