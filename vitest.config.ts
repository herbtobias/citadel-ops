import { defineConfig } from 'vitest/config'

// Unit tests for the pure server-side logic (no Nuxt runtime, no DB). DB/HTTP
// integration tests live in test/integration and self-skip unless TEST_DATABASE_URL
// is set (see that file).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
  },
})
