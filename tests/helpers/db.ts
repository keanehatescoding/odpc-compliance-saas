import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { onTestFinished } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";

/**
 * A fresh in-memory database with every migration applied, closed when the
 * current test finishes, whether it passes or fails. Call it from a test or
 * a beforeEach hook.
 */
export async function openTestDb(): Promise<Db> {
  const client = new PGlite();
  onTestFinished(() => client.close());
  const pg = drizzle({ client, schema });
  await migrate(pg, { migrationsFolder: "drizzle" });
  return pg as unknown as Db;
}
