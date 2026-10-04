import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { runBreachAlerts } from "@/lib/breach-alerts";
import type { EmailMessage } from "@/lib/email";

let db: Db;
let outbox: EmailMessage[];
const send = async (m: EmailMessage) => void outbox.push(m);

const discoveredAt = new Date("2026-09-27T06:00:00Z"); // 09:00 Nairobi
const at = (hours: number) => new Date(discoveredAt.getTime() + hours * 3_600_000);

async function setup(breach: Partial<typeof schema.breaches.$inferInsert> = {}) {
  const [o] = await db
    .insert(schema.organizations)
    .values({ name: "Sunrise Academy", sector: "education", size: "micro_small" })
    .returning();
  const [u] = await db
    .insert(schema.users)
    .values({ email: `owner-${o.id}@example.co.ke`, name: "Owner", passwordHash: "x", emailVerifiedAt: new Date() })
    .returning();
  await db.insert(schema.memberships).values({ userId: u.id, orgId: o.id, role: "owner" });
  const [b] = await db
    .insert(schema.breaches)
    .values({ orgId: o.id, title: "Fee list leak", kind: "misdirected", description: "Wrong group.", discoveredAt, ...breach })
    .returning();
  return { org: o, user: u, breach: b };
}

beforeEach(async () => {
  const client = new PGlite();
  const pg = drizzle({ client, schema });
  await migrate(pg, { migrationsFolder: "drizzle" });
  db = pg as unknown as Db;
  outbox = [];
});

describe("runBreachAlerts", () => {
  it("alerts owners when a breach is logged, once", async () => {
    const { user, breach } = await setup();
    const r = await runBreachAlerts(db, send, { now: at(1), appUrl: "https://app.test" });
    await runBreachAlerts(db, send, { now: at(2) });

    expect(r.sent).toEqual([{ breachId: breach.id, kind: "logged", to: [user.email] }]);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].subject).toBe("Sunrise Academy: notify the ODPC of breach within 71 hours (Fee list leak)");
    expect(outbox[0].text).toContain("https://app.test/breaches/" + breach.id);
  });

  it("escalates at 24 hours left and when overdue", async () => {
    await setup();
    await runBreachAlerts(db, send, { now: at(1) });
    await runBreachAlerts(db, send, { now: at(50) });
    await runBreachAlerts(db, send, { now: at(60) });
    await runBreachAlerts(db, send, { now: at(73) });
    expect(outbox.map((m) => m.subject)).toEqual([
      expect.stringMatching(/within 71 hours/),
      expect.stringMatching(/within 22 hours/),
      expect.stringMatching(/overdue/),
    ]);
  });

  it("stops once the ODPC has been notified", async () => {
    const { breach } = await setup();
    await db.update(schema.breaches).set({ notifiedAt: at(5) }).where(eq(schema.breaches.id, breach.id));
    const r = await runBreachAlerts(db, send, { now: at(6) });
    expect(r.checked).toBe(0);
    expect(outbox).toHaveLength(0);
  });

  it("stays quiet when a controller assesses harm as unlikely", async () => {
    await setup({ risk: "unlikely", riskNotes: "Encrypted." });
    await runBreachAlerts(db, send, { now: at(1) });
    expect(outbox).toHaveLength(0);
  });

  it("can be limited to one breach", async () => {
    await setup();
    const { breach } = await setup();
    const r = await runBreachAlerts(db, send, { now: at(1), breachId: breach.id });
    expect(r.sent.map((s) => s.breachId)).toEqual([breach.id]);
  });

  it("releases the claim when sending fails", async () => {
    await setup();
    const r1 = await runBreachAlerts(db, async () => { throw new Error("SMTP down"); }, { now: at(1) });
    expect(r1.failed).toHaveLength(1);
    expect(await db.select().from(schema.breachAlertLog)).toHaveLength(0);
    const r2 = await runBreachAlerts(db, send, { now: at(1) });
    expect(r2.sent).toHaveLength(1);
  });
});
