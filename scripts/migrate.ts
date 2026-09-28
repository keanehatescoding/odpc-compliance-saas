import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pgDb } from "@/db";

await migrate(pgDb, { migrationsFolder: "drizzle" });
console.log("Migrations applied.");
process.exit(0);
