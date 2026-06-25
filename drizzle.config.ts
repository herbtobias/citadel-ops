import { defineConfig } from 'drizzle-kit'

// Loads DATABASE_URL from .env (drizzle-kit reads .env automatically).
export default defineConfig({
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://citadel:citadel@localhost:5433/citadel',
  },
  casing: 'snake_case',
  verbose: true,
  strict: true,
})
