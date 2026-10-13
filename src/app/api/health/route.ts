import { sql } from "drizzle-orm";
import { db } from "@/db";

// The host's health check (`.railway/railway.ts` → healthcheck). Anything
// that answers 200 here is what the platform calls healthy, so this asks
// Postgres as well: /login renders without a database, and a wrong or
// unreachable DATABASE_URL would otherwise pass the check and then 500 on
// every real request.
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (err) {
    // Logged rather than returned: the response says only whether the database
    // answered, and the platform retries the check until the timeout.
    console.error("Health check failed: the database didn't answer", err);
    return Response.json({ ok: false }, { status: 503 });
  }
}