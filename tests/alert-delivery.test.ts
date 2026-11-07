import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { CLAIM_LEASE_MS, deliverClaimed, rejectedRecipients } from "@/lib/alert-delivery";
import { exportOrganization } from "@/lib/account";
import type { EmailMessage, SendEmail } from "@/lib/email";
import { runReminders } from "@/lib/reminders";

const { memberships, organizations, registrations, reminderLog, users } = schema;

describe("deliverClaimed", () => {
  const message: EmailMessage = { to: ["a@sunrise.ke", "b@sunrise.ke"], subject: "s", text: "t" };
  const claim = () => ({ label: "test", markSent: vi.fn(async () => {}), release: vi.fn(async () => {}) });

  it("marks the claim sent to everyone when the server takes the email", async () => {
    const c = claim();
    expect(await deliverClaimed(async () => {}, message, c)).toEqual({ sent: message.to, error: undefined });
    expect(c.markSent).toHaveBeenCalledWith(message.to);
    expect(c.release).not.toHaveBeenCalled();
  });

  it("releases the claim when the send fails, so the next run retries", async () => {
    const c = claim();
    const failing: SendEmail = async () => {
      throw new Error("SMTP down");
    };
    expect(await deliverClaimed(failing, message, c)).toEqual({ error: "SMTP down" });
    expect(c.release).toHaveBeenCalledOnce();
    expect(c.markSent).not.toHaveBeenCalled();
  });

  it("records only the recipients the server accepted, and reports the rest", async () => {
    const c = claim();
    const partial: SendEmail = async () => ({ rejected: ["B@Sunrise.ke"] });
    expect(await deliverClaimed(partial, message, c)).toEqual({
      sent: ["a@sunrise.ke"],
      error: "The mail server rejected b@sunrise.ke; the others were sent the email.",
    });
    expect(c.markSent).toHaveBeenCalledWith(["a@sunrise.ke"]);
    expect(c.release).not.toHaveBeenCalled();
  });

  it("releases the claim if every recipient was rejected", async () => {
    const c = claim();
    const none: SendEmail = async (m) => ({ rejected: m.to });
    expect(await deliverClaimed(none, message, c)).toEqual({
      error: "The mail server rejected every recipient: a@sunrise.ke, b@sunrise.ke",
    });
    expect(c.release).toHaveBeenCalledOnce();
  });

  it("reports the email sent, and the failure to record it, if marking it fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = { ...claim(), markSent: async () => Promise.reject(new Error("db gone")) };
    expect(await deliverClaimed(async () => {}, message, c)).toEqual({
      sent: message.to,
      error: "The email was sent but couldn't be recorded, so it may be sent again: db gone",
    });
    expect(error).toHaveBeenCalledWith("Failed to mark test sent", expect.any(Error));
    expect(c.release).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("reports both a rejected recipient and a failure to record the send", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = { ...claim(), markSent: async () => Promise.reject(new Error("db gone")) };
    expect(await deliverClaimed(async () => ({ rejected: ["b@sunrise.ke"] }), message, c)).toEqual({
      sent: ["a@sunrise.ke"],
      error:
        "The mail server rejected b@sunrise.ke; the others were sent the email. " +
        "The email was sent but couldn't be recorded, so it may be sent again: db gone",
    });
    error.mockRestore();
  });

  it("matches rejected addresses whatever their case or spacing", () => {
    expect(rejectedRecipients(["a@x.ke", "b@x.ke"], [" A@X.KE "])).toEqual(["a@x.ke"]);
    expect(rejectedRecipients(["a@x.ke"])).toEqual([]);
  });
});

describe("claims in the runners", () => {
  let db: Db;
  let outbox: EmailMessage[];
  let orgId: string;
  let registrationId: string;
  const send = async (m: EmailMessage) => void outbox.push(m);
  // 20 days before the certificate expires: the 30-day reminder is due.
  const today = "2026-09-28";
  const now = new Date("2026-09-28T06:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  beforeEach(async () => {
    const client = new PGlite();
    const pg = drizzle({ client, schema });
    await migrate(pg, { migrationsFolder: "drizzle" });
    db = pg as unknown as Db;
    outbox = [];
    const [o] = await db
      .insert(organizations)
      .values({ name: "Sunrise Academy", sector: "education", size: "micro_small", reminderEmail: "a@sunrise.ke, b@sunrise.ke" })
      .returning();
    orgId = o.id;
    const [u] = await db
      .insert(users)
      .values({ email: "owner@sunrise.ke", name: "Owner", passwordHash: "x", emailVerifiedAt: new Date() })
      .returning();
    await db.insert(memberships).values({ userId: u.id, orgId, role: "owner" });
    const [r] = await db
      .insert(registrations)
      .values({ orgId, role: "controller", issuedOn: "2024-10-18", expiresOn: "2026-10-18" })
      .returning();
    registrationId = r.id;
  });

  const leftClaim = (claimedAt: Date) =>
    db
      .insert(reminderLog)
      .values({ registrationId, expiresOn: "2026-10-18", thresholdDays: 30, recipients: ["a@sunrise.ke"], claimedAt, sentAt: null });

  it("marks the reminder sent once it has gone", async () => {
    await runReminders(db, send, { now, today });
    expect(await db.select().from(reminderLog)).toMatchObject([{ claimedAt: now, sentAt: now }]);
  });

  it("stamps each claim and send when it happens, not when the run began", async () => {
    // The first send is slow, so the run reaches the second reminder past the lease.
    await db.insert(registrations).values({ orgId, role: "processor", issuedOn: "2024-10-18", expiresOn: "2026-10-18" });
    const later = new Date(now.getTime() + CLAIM_LEASE_MS + 60_000);
    const slow: SendEmail = async (m) => {
      outbox.push(m);
      if (outbox.length === 1) vi.setSystemTime(later);
    };
    vi.useFakeTimers({ toFake: ["Date"], now });
    try {
      await runReminders(db, slow, { today });
    } finally {
      vi.useRealTimers();
    }
    const rows = (await db.select().from(reminderLog)).sort((a, b) => a.claimedAt.getTime() - b.claimedAt.getTime());
    // The second claim starts its lease when it's made, so an overlapping run can't take it over mid-send.
    expect(rows).toMatchObject([
      { claimedAt: now, sentAt: later },
      { claimedAt: later, sentAt: later },
    ]);
  });

  it("counts a row written without sent_at, as the app from before claims writes them, as sent", async () => {
    // Such an app may still be running while the migration deploys.
    // It doesn't know claimed_at either, which takes the database's clock.
    await db.insert(reminderLog).values({ registrationId, expiresOn: "2026-10-18", thresholdDays: 30, recipients: ["a@sunrise.ke"] });
    // Long enough after that the row would be an abandoned claim, if it didn't count as sent.
    const r = await runReminders(db, send, { now: new Date(Date.now() + 2 * CLAIM_LEASE_MS), today });
    expect(r.sent).toEqual([]);
    expect(outbox).toHaveLength(0);
  });

  it("leaves a claim alone while the run that made it may still be sending", async () => {
    await leftClaim(ago(CLAIM_LEASE_MS - 60_000));
    const r = await runReminders(db, send, { now, today });
    expect(r.sent).toEqual([]);
    expect(outbox).toHaveLength(0);
  });

  it("sends the email a run died before sending, once its claim has expired", async () => {
    await leftClaim(ago(CLAIM_LEASE_MS + 60_000));
    const r = await runReminders(db, send, { now, today });
    expect(r.sent).toEqual([{ registrationId, threshold: 30, to: ["a@sunrise.ke", "b@sunrise.ke"] }]);
    expect(outbox).toHaveLength(1);
    expect(await db.select().from(reminderLog)).toMatchObject([{ claimedAt: now, sentAt: now }]);
    // And only once.
    await runReminders(db, send, { now: new Date(now.getTime() + 2 * CLAIM_LEASE_MS), today });
    expect(outbox).toHaveLength(1);
  });

  it("doesn't release or mark a claim another run has taken over", async () => {
    // This run's claim expires mid-send, and a second run takes it over. The
    // first then fails while the second is still sending.
    const later = new Date(now.getTime() + CLAIM_LEASE_MS + 60_000);
    let entered!: () => void;
    const secondSending = new Promise<void>((resolve) => (entered = resolve));
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    const secondSend: SendEmail = async (m) => {
      entered();
      await gate;
      outbox.push(m);
    };
    let second!: Promise<unknown>;
    const firstSend: SendEmail = async () => {
      second = runReminders(db, secondSend, { now: later, today });
      await secondSending;
      throw new Error("timed out");
    };
    const r = await runReminders(db, firstSend, { now, today });
    finish();
    await second;
    expect(r.failed).toEqual([{ registrationId, error: "timed out" }]);
    // The first run's failure didn't release the second's claim, so its send is recorded.
    expect(await db.select().from(reminderLog)).toMatchObject([{ claimedAt: later, sentAt: later }]);
    expect(outbox).toHaveLength(1);
  });

  it("doesn't mark a taken-over claim sent when the first run's send succeeds", async () => {
    // As above, but the first send goes through while the second run is still sending.
    const later = new Date(now.getTime() + CLAIM_LEASE_MS + 60_000);
    let entered!: () => void;
    const secondSending = new Promise<void>((resolve) => (entered = resolve));
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    const secondSend: SendEmail = async (m) => {
      entered();
      await gate;
      outbox.push(m);
    };
    let second!: Promise<unknown>;
    const firstSend: SendEmail = async (m) => {
      second = runReminders(db, secondSend, { now: later, today });
      await secondSending;
      outbox.push(m);
    };
    const r = await runReminders(db, firstSend, { now, today });
    expect(r.sent).toHaveLength(1);
    // The claim is the second run's, and stays unsent until its own send settles.
    expect(await db.select().from(reminderLog)).toMatchObject([{ claimedAt: later, sentAt: null }]);
    finish();
    await second;
    expect(await db.select().from(reminderLog)).toMatchObject([{ claimedAt: later, sentAt: later }]);
    // Both went: at least once, never lost.
    expect(outbox).toHaveLength(2);
  });

  it("fails the run if a sent reminder can't be recorded", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "update").mockReturnValue({ set: () => ({ where: () => Promise.reject(new Error("db gone")) }) } as never);
    const r = await runReminders(db, send, { now, today });
    vi.mocked(db.update).mockRestore();
    error.mockRestore();
    expect(r.sent).toEqual([{ registrationId, threshold: 30, to: ["a@sunrise.ke", "b@sunrise.ke"] }]);
    expect(r.failed).toEqual([{ registrationId, error: "The email was sent but couldn't be recorded, so it may be sent again: db gone" }]);
    expect(await db.select().from(reminderLog)).toMatchObject([{ claimedAt: now, sentAt: null }]);
  });

  it("records who the server accepted and reports who it rejected, without sending again", async () => {
    const partial: SendEmail = async (m) => {
      outbox.push(m);
      return { rejected: ["b@sunrise.ke"] };
    };
    const r = await runReminders(db, partial, { now, today });
    expect(r.sent).toEqual([{ registrationId, threshold: 30, to: ["a@sunrise.ke"] }]);
    expect(r.failed).toEqual([{ registrationId, error: "The mail server rejected b@sunrise.ke; the others were sent the email." }]);
    expect(await db.select().from(reminderLog)).toMatchObject([{ recipients: ["a@sunrise.ke"], sentAt: now }]);

    await runReminders(db, partial, { now: new Date(now.getTime() + 2 * CLAIM_LEASE_MS), today });
    expect(outbox).toHaveLength(1);
  });

  it("leaves unsent claims out of the export", async () => {
    await leftClaim(now);
    const data = await exportOrganization(db, orgId, now);
    expect(data!.registrations[0].remindersSent).toEqual([]);

    await runReminders(db, send, { now: new Date(now.getTime() + 2 * CLAIM_LEASE_MS), today });
    expect((await exportOrganization(db, orgId, now))!.registrations[0].remindersSent).toEqual([
      { expiresOn: "2026-10-18", thresholdDays: 30, recipients: ["a@sunrise.ke", "b@sunrise.ke"], sentAt: new Date(now.getTime() + 2 * CLAIM_LEASE_MS) },
    ]);
  });
});
