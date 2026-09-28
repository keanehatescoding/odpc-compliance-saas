import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

/** Any Postgres-backed Drizzle database with our schema (node-postgres in the app, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { pool?: Pool };

function getPool(): Pool {
  if (!globalForDb.pool) {
    // Pool connects lazily, so a missing DATABASE_URL surfaces on first query
    // rather than at import (which would break `next build`).
    // Reuse the pool across hot reloads in development.
    globalForDb.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
  return globalForDb.pool;
}

/** The concrete node-postgres instance, for APIs (like the migrator) that need it. */
export const pgDb = drizzle({ client: getPool(), schema });
export const db: Db = pgDb;
export { schema };
