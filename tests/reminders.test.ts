import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import type { EmailMessage } from "@/lib/email";
import { runReminders } from "@/lib/reminders";

let db: Db;
let outbox: EmailMessage[];
const send = async (m: EmailMessage) => void outbox.push(m);

async function setup(reg: Partial<typeof schema.registrations.$inferInsert>, org: Partial<typeof schema.organizations.$inferInsert> = {}) {
  const [o] = await db
    .insert(schema.organizations)
    .values({ name: "Sunrise Academy", sector: "education", size: "micro_small", ...org })
    .returning();
  const [u] = await db
    .insert(schema.users)
    .values({ email: `owner-${o.id}@example.co.ke`, name: "Owner", passwordHash: "x" })
    .returning();
  await db.insert(schema.memberships).values({ userId: u.id, orgId: o.id, role: "owner" });
  const [r] = await db
    .insert(schema.registrations)
    .values({ orgId: o.id, role: "controller", issuedOn: "2024-10-18", expiresOn: "2026-10-18", ...reg })
    .returning();
  return { org: o, user: u, reg: r };
}

beforeEach(async () => {
  const client = new PGlite();
  const pg = drizzle({ client, schema });
  await migrate(pg, { migrationsFolder: "drizzle" });
  db = pg as unknown as Db;
  outbox = [];
});

describe("runReminders", () => {
  it("emails owners the most recent threshold and records it", async () => {
    const { user, reg } = await setup({});
    const r = await runReminders(db, send, { today: "2026-09-28", appUrl: "https://app.test" });

    expect(r.sent).toEqual([{ registrationId: reg.id, threshold: 30, to: [user.email] }]);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].subject).toBe("Sunrise Academy: ODPC data controller registration expires in 20 days");
    expect(outbox[0].text).toContain("https://app.test/registrations");
    expect(outbox[0].text).toContain("KSh 2,000");

    const log = await db.select().from(schema.reminderLog);
    expect(log).toMatchObject([{ registrationId: reg.id, expiresOn: "2026-10-18", thresholdDays: 30 }]);
  });

  it("is idempotent within a day and fires again at the next threshold", async () => {
    await setup({});
    await runReminders(db, send, { today: "2026-09-28" });
    await runReminders(db, send, { today: "2026-09-28" });
    await runReminders(db, send, { today: "2026-10-01" }); // 17 days left, still in the 30-day window
    expect(outbox).toHaveLength(1);

    await runReminders(db, send, { today: "2026-10-04" }); // 14 days left
    expect(outbox).toHaveLength(2);
    expect(outbox[1].subject).toMatch(/expires in 14 days$/);
  });

  it("prefers the organisation's reminder address", async () => {
    await setup({}, { reminderEmail: "compliance@sunrise.ac.ke, bursar@sunrise.ac.ke" });
    await runReminders(db, send, { today: "2026-09-28" });
    expect(outbox[0].to).toEqual(["compliance@sunrise.ac.ke", "bursar@sunrise.ac.ke"]);
  });

  it("stops once a renewal has been filed", async () => {
    await setup({ appliedOn: "2026-09-20" });
    const r = await runReminders(db, send, { today: "2026-09-28" });
    expect(r.checked).toBe(1);
    expect(outbox).toHaveLength(0);
  });

  it("starts a fresh cycle when the expiry date changes", async () => {
    const { reg } = await setup({});
    await runReminders(db, send, { today: "2026-09-28" });
    await db
      .update(schema.registrations)
      .set({ issuedOn: "2026-10-10", expiresOn: "2026-10-30" })
      .where(eq(schema.registrations.id, reg.id));
    await runReminders(db, send, { today: "2026-09-28" }); // 32 days left on the new certificate → 60-day reminder
    expect(outbox.map((m) => m.subject)).toEqual([
      expect.stringMatching(/in 20 days$/),
      expect.stringMatching(/in 32 days$/),
    ]);
  });

  it("releases the claim when sending fails so the next run retries", async () => {
    await setup({});
    const failing = async () => {
      throw new Error("SMTP down");
    };
    const r1 = await runReminders(db, failing, { today: "2026-09-28" });
    expect(r1.failed).toHaveLength(1);
    expect(await db.select().from(schema.reminderLog)).toHaveLength(0);

    const r2 = await runReminders(db, send, { today: "2026-09-28" });
    expect(r2.sent).toHaveLength(1);
  });

  it("skips registrations without an expiry date", async () => {
    await setup({ issuedOn: null, expiresOn: null, appliedOn: "2026-09-01" });
    const r = await runReminders(db, send, { today: "2026-09-28" });
    expect(r.checked).toBe(0);
  });
});
