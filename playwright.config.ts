import { defineConfig, devices } from '@playwright/test'

// Citadel Ops — E2E smoke tests (§18 "UI"). A thin Playwright harness that drives
// the real app in a headless browser over the critical human paths (auth + board).
// It runs SEPARATELY from the vitest suites: vitest owns `test/**/*.test.ts`, these
// specs are `test/e2e/**/*.spec.ts`, so the two never collect each other's files.
//
// The webServer boots `npm run dev` and waits on /health; globalSetup re-seeds the
// DB to a known demo state first. Locally an already-running dev server is reused.
// Pin an explicit port: Nuxt silently hops to the next free port if 3000 is
// taken (e.g. Docker Desktop binds it locally), which would desync the health
// wait below. 3100 sidesteps the common clash; override with E2E_PORT.
const PORT = Number(process.env.E2E_PORT || 3100)
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`

export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.spec.ts',
  // Smoke flows mutate shared demo data (login throttle, password reset), so keep
  // them serial and deterministic rather than racing one DB.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  globalSetup: './test/e2e/global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `${BASE_URL}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Dev server needs a DB + a ≥32-char session secret (server/plugins/00.env-check).
      DATABASE_URL: process.env.DATABASE_URL || 'postgres://citadel:citadel@localhost:5433/citadel',
      NUXT_SESSION_PASSWORD:
        process.env.NUXT_SESSION_PASSWORD || 'e2e-only-session-password-32-characters',
    },
  },
})
