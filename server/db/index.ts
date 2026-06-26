// Citadel Ops — Drizzle/Postgres client. Single pooled connection per process.
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString =
  process.env.DATABASE_URL || 'postgres://citadel:citadel@localhost:5433/citadel'

// `postgres` is lazy; the pool only connects on first query.
const client = postgres(connectionString, { max: 10 })

export const db = drizzle(client, { schema, casing: 'snake_case' })
export { schema }
export type DB = typeof db
