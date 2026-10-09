import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import type { EmailMessage } from "@/lib/email";
import { createLegalNotice, legalNoticeError, legalNoticeRecipients, pendingLegalNotices, runLegalNotices } from "@/lib/legal-notices";

const { legalNoticeLog, memberships, organizations, users } = schema;

const DAY = 24 * 60 * 60 * 1000;
// 9 October 2026, midday in Nairobi.
const t0 = new Date("2026-10-09T09:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);
const seller = { name: "Kinga Ltd", kraPin: null, address: null, email: "privacy@kinga.test" };
const opts = (now = t0) => ({ now, appUrl: "https://kinga.test", seller });

let db: Db;

const capture = () => {
  const sent: EmailMessage[] = [];
  const send = async (m: EmailMessage) => {
    sent.push(m);
  };
  return { sent, send };
};

async function addOrg(name: string, people: { email: string; role: "owner" | "admin" | "member"; verified?: boolean }[]) {
  const [org] = await db.insert(organizations).values({ name, sector: "education", size: "medium" }).returning();
  for (const p of people) {
    const [u] = await db
      .insert(users)
      .values({ email: p.email, name: p.email, passwordHash: "x", emailVerifiedAt: p.verified === false ? null : t0 })
      .returning();
    await db.insert(memberships).values({ orgId: org.id, userId: u.id, role: p.role });
  }
  return org;
}

async function notice(effectiveOn = "2026-11-08", summary = "We're adding Resend as our email provider.") {
  const r = await createLegalNotice(db, effectiveOn, summary, t0);
  if ("error" in r) throw new Error(r.error);
  return r.notice;
}

beforeEach(async () => {
  const client = new PGlite();
  const pg = drizzle({ client, schema });
  await migrate(pg, { migrationsFolder: "drizzle" });
  db = pg as unknown as Db;
});

describe("legalNoticeError", () => {
  it("needs at least 30 days' notice, counted in Nairobi", () => {
    expect(legalNoticeError("2026-11-08", "x", t0)).toBeNull();
    expect(legalNoticeError("2026-11-07", "x", t0)).toMatch(/8 Nov 2026 at the earliest/);
    // 22:00 UTC on 8 October is already the 9th in Nairobi.
    expect(legalNoticeError("2026-11-07", "x", new Date("2026-10-08T22:00:00Z"))).not.toBeNull();
  });

  it("needs a real date and a summary", () => {
    expect(legalNoticeError("2026-11-31", "x", t0)).toMatch(/YYYY-MM-DD/);
    expect(legalNoticeError("2026-12-01", "  \n", t0)).toMatch(/what's changing/);
  });

  it("won't save a notice that gives too little warning", async () => {
    expect(await createLegalNotice(db, "2026-10-20", "Soon", t0)).toEqual({ error: expect.any(String) });
    expect(await pendingLegalNotices(db, t0)).toHaveLength(0);
  });
});

describe("runLegalNotices", () => {
  it("emails each verified owner of a live organisation once, on their own", async () => {
    await addOrg("Sunrise Academy", [
      { email: "a@sunrise.ke", role: "owner" },
      { email: "b@sunrise.ke", role: "owner" },
      { email: "admin@sunrise.ke", role: "admin" },
      { email: "unconfirmed@sunrise.ke", role: "owner", verified: false },
    ]);
    const gone = await addOrg("Closed Clinic", [{ email: "owner@clinic.ke", role: "owner" }]);
    await db.update(organizations).set({ deletedAt: t0 }).where(eq(organizations.id, gone.id));
    const n = await notice();

    const { sent, send } = capture();
    const result = await runLegalNotices(db, send, opts());
    expect(sent.map((m) => m.to)).toEqual([["a@sunrise.ke"], ["b@sunrise.ke"]]);
    expect(result).toMatchObject({ checked: 1, failed: [] });
    expect(sent[0].subject).toBe("Kinga's terms are changing on 8 Nov 2026");
    expect(sent[0].text).toContain("We're adding Resend as our email provider.");
    expect(sent[0].text).toContain("an owner can delete Sunrise Academy from Settings before 8 Nov 2026");
    expect(sent[0].text).toContain("https://kinga.test/dpa");
    expect(sent[0].text).toContain("privacy@kinga.test");

    const again = capture();
    await runLegalNotices(db, again.send, opts(later(DAY)));
    expect(again.sent).toHaveLength(0);
    expect(await pendingLegalNotices(db, t0)).toEqual([{ notice: n, sent: 2 }]);
  });

  it("emails an owner of several organisations once, naming each", async () => {
    await addOrg("Sunrise Academy", [{ email: "a@sunrise.ke", role: "owner" }]);
    const [u] = await db.select().from(users).where(eq(users.email, "a@sunrise.ke"));
    const [clinic] = await db.insert(organizations).values({ name: "Hope Clinic", sector: "education", size: "medium" }).returning();
    await db.insert(memberships).values({ orgId: clinic.id, userId: u.id, role: "owner" });
    await notice();

    expect(await legalNoticeRecipients(db, null, t0)).toHaveLength(1);
    const { sent, send } = capture();
    await runLegalNotices(db, send, opts());
    expect(sent.map((m) => m.to)).toEqual([["a@sunrise.ke"]]);
    expect(sent[0].text).toContain("the terms Sunrise Academy and Hope Clinic use Kinga under");
    expect(sent[0].text).toContain("an owner can delete Sunrise Academy or Hope Clinic from Settings");
  });

  it("tells someone who becomes an owner before the change, but not after it takes effect", async () => {
    const org = await addOrg("Sunrise Academy", [{ email: "a@sunrise.ke", role: "owner" }]);
    await notice();
    await runLegalNotices(db, capture().send, opts());

    const [u] = await db.insert(users).values({ email: "new@sunrise.ke", name: "New", passwordHash: "x", emailVerifiedAt: t0 }).returning();
    await db.insert(memberships).values({ orgId: org.id, userId: u.id, role: "owner" });
    const before = capture();
    await runLegalNotices(db, before.send, opts(later(10 * DAY)));
    expect(before.sent.map((m) => m.to)).toEqual([["new@sunrise.ke"]]);

    await db.delete(legalNoticeLog).where(eq(legalNoticeLog.userId, u.id));
    // Midnight on 8 November in Nairobi: the change is in effect.
    const after = capture();
    const result = await runLegalNotices(db, after.send, opts(new Date("2026-11-07T21:00:00Z")));
    expect(after.sent).toHaveLength(0);
    expect(result.checked).toBe(0);
  });

  it("tries a failed email again on the next run", async () => {
    await addOrg("Sunrise Academy", [
      { email: "a@sunrise.ke", role: "owner" },
      { email: "b@sunrise.ke", role: "owner" },
    ]);
    await notice();
    const failing = async (m: EmailMessage) => {
      if (m.to[0] === "a@sunrise.ke") throw new Error("SMTP down");
    };
    const first = await runLegalNotices(db, failing, opts());
    expect(first.sent.map((s) => s.to)).toEqual(["b@sunrise.ke"]);
    expect(first.failed).toEqual([expect.objectContaining({ error: "SMTP down" })]);

    const { sent, send } = capture();
    await runLegalNotices(db, send, opts(later(60 * 60 * 1000)));
    expect(sent.map((m) => m.to)).toEqual([["a@sunrise.ke"]]);
  });

  it("sends an email again if the run that claimed it died before sending", async () => {
    const org = await addOrg("Sunrise Academy", [{ email: "a@sunrise.ke", role: "owner" }]);
    const n = await notice();
    const [owner] = await db.select().from(memberships).where(eq(memberships.orgId, org.id));
    await db.insert(legalNoticeLog).values({ noticeId: n.id, userId: owner.userId, email: "a@sunrise.ke", claimedAt: t0 });
    expect(await pendingLegalNotices(db, t0)).toEqual([{ notice: n, sent: 0 }]);

    // Still within the lease: the first run might be sending it.
    const soon = capture();
    await runLegalNotices(db, soon.send, opts(later(10 * 60 * 1000)));
    expect(soon.sent).toHaveLength(0);

    const { sent, send } = capture();
    await runLegalNotices(db, send, opts(later(60 * 60 * 1000)));
    expect(sent.map((m) => m.to)).toEqual([["a@sunrise.ke"]]);
    expect(await pendingLegalNotices(db, t0)).toEqual([{ notice: n, sent: 1 }]);

    const again = capture();
    await runLegalNotices(db, again.send, opts(later(DAY)));
    expect(again.sent).toHaveLength(0);
  });

  it("doesn't mark sent a claim another run took over after the lease ran out", async () => {
    await addOrg("Sunrise Academy", [{ email: "a@sunrise.ke", role: "owner" }]);
    await notice();
    const gate = () => {
      let open!: () => void;
      let entered!: () => void;
      const opened = new Promise<void>((r) => (open = r));
      const inside = new Promise<void>((r) => (entered = r));
      return { open, inside, wait: () => (entered(), opened) };
    };

    const slow = gate();
    const first = runLegalNotices(db, () => slow.wait(), opts());
    await slow.inside;
    await db.update(users).set({ email: "new@sunrise.ke" }).where(eq(users.email, "a@sunrise.ke"));
    const failing = gate();
    const second = runLegalNotices(
      db,
      () => failing.wait().then(() => Promise.reject(new Error("SMTP down"))),
      opts(later(60 * 60 * 1000)),
    );
    await failing.inside;

    slow.open();
    await first;
    failing.open();
    await second;
    // Only the old address got it, so the new one is still owed the notice.
    expect(await db.select().from(legalNoticeLog)).toHaveLength(0);
  });

  it("sends overlapping runs' emails once", async () => {
    await addOrg("Sunrise Academy", [{ email: "a@sunrise.ke", role: "owner" }]);
    await notice();
    const { sent, send } = capture();
    await Promise.all([runLegalNotices(db, send, opts()), runLegalNotices(db, send, opts())]);
    expect(sent).toHaveLength(1);
  });

  it("forgets who was told when their account is deleted", async () => {
    await addOrg("Sunrise Academy", [{ email: "a@sunrise.ke", role: "owner" }]);
    await notice();
    await runLegalNotices(db, capture().send, opts());
    await db.delete(users).where(eq(users.email, "a@sunrise.ke"));
    expect(await db.select().from(legalNoticeLog)).toHaveLength(0);
  });
});
