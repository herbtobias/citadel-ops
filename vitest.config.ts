import { defineConfig } from 'vitest/config'

// Unit tests for the pure server-side logic (no Nuxt runtime, no DB). DB/HTTP
// integration tests live in test/integration and self-skip unless TEST_DATABASE_URL
// is set (see that file).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      // lcov → Codecov; text → CI log; html → local browsing.
      reporter: ['text-summary', 'lcov', 'html'],
      reportsDirectory: './coverage',
      // Scope to the pure core-logic modules the unit suite owns (license,
      // state-machine, references, validation, ratelimit, tracing, crypto, …).
      // API route handlers + DB access are exercised by the DB-gated integration
      // and HTTP suites instead, so they'd only dilute the unit number here.
      include: ['server/utils/**/*.ts', 'mcp/**/*.ts'],
      exclude: ['**/*.d.ts'],
    },
  },
})
