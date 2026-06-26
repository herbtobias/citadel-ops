import { execSync } from 'node:child_process'

// Re-seed the DB to the known demo state before the E2E run so the auth specs
// (login throttle, password reset) and the board spec see deterministic data.
// Mirrors the HTTP scenario's beforeAll re-seed. Skipped with E2E_SKIP_SEED=1
// when you've already seeded and just want a fast local re-run.
export default async function globalSetup() {
  if (process.env.E2E_SKIP_SEED === '1') {
    console.log('[e2e] skipping seed (E2E_SKIP_SEED=1)')
    return
  }
  console.log('[e2e] seeding database…')
  execSync('npm run db:seed', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || 'postgres://citadel:citadel@localhost:5433/citadel',
    },
  })
}
