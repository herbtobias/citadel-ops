// Citadel Ops — Drizzle/Postgres client. Single pooled connection per process.
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString =
  process.env.DATABASE_URL || 'postgres://citadel:citadel@localhost:5433/citadel'

// Per-process pool size. Keep conservative for multi-instance: with N Cloud Run instances,
// N × DB_POOL_MAX must stay under the Cloud SQL max_connections (minus a reserve). For higher
// instance counts, front the DB with PgBouncer / the Cloud SQL connector in pooling mode. §HORIZON M7.
const poolMax = Number.parseInt(process.env.DB_POOL_MAX || '10', 10) || 10

// `postgres` is lazy; the pool only connects on first query.
const client = postgres(connectionString, { max: poolMax })

export const db = drizzle(client, { schema, casing: 'snake_case' })
export { schema }
export type DB = typeof db
