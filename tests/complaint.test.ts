import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import {
  awaitsResponse,
  complaintStatus,
  daysToAct,
  defaultDueOn,
  dueComplaintAlert,
  respondedLate,
  type ComplaintLike,
} from "@/lib/complaint";
import { runComplaintAlerts } from "@/lib/complaint-alerts";
import { parseComplaintForm } from "@/lib/complaint-form";
import type { EmailMessage } from "@/lib/email";

const complaint = (over: Partial<ComplaintLike> = {}): ComplaintLike => ({
  kind: "complaint",
  receivedOn: "2026-10-01",
  dueOn: "2026-10-22",
  respondedOn: null,
  closedOn: null,
  ...over,
});

describe("deadlines", () => {
  it("gives a complaint 21 days and leaves the rest to the notice", () => {
    expect(defaultDueOn("complaint", "2026-10-01")).toBe("2026-10-22");
    expect(defaultDueOn("enforcement_notice", "2026-10-01")).toBeNull();
    expect(defaultDueOn("penalty_notice", "2026-10-01")).toBeNull();
    expect(defaultDueOn("information", "2026-10-01")).toBeNull();
  });

  it("is open, then due soon, then overdue", () => {
    const c = complaint();
    expect(complaintStatus(c, "2026-10-16")).toBe("open");
    expect(complaintStatus(c, "2026-10-17")).toBe("due_soon");
    expect(complaintStatus(c, "2026-10-22")).toBe("due_soon");
    expect(complaintStatus(c, "2026-10-23")).toBe("overdue");
    expect(daysToAct(c, "2026-10-23")).toBe(-1);
  });

  it("waits on the ODPC once responded, and flags a late response", () => {
    const onTime = complaint({ respondedOn: "2026-10-22" });
    const late = complaint({ respondedOn: "2026-10-23" });
    expect(complaintStatus(onTime, "2026-12-01")).toBe("responded");
    expect(awaitsResponse(complaintStatus(onTime, "2026-12-01"))).toBe(false);
    expect(respondedLate(onTime)).toBe(false);
    expect(respondedLate(late)).toBe(true);
  });

  it("is closed once the ODPC has decided, responded to or not", () => {
    expect(complaintStatus(complaint({ respondedOn: "2026-10-10", closedOn: "2026-11-20" }), "2026-12-01")).toBe("closed");
    expect(complaintStatus(complaint({ closedOn: "2026-10-05" }), "2026-12-01")).toBe("closed");
  });
});

describe("dueComplaintAlert", () => {
  it("sends due-soon then overdue, once each", () => {
    const c = complaint();
    expect(dueComplaintAlert(c, "2026-10-16", new Set())).toBeNull();
    expect(dueComplaintAlert(c, "2026-10-17", new Set())).toBe("due_soon");
    expect(dueComplaintAlert(c, "2026-10-18", new Set(["due_soon"]))).toBeNull();
    expect(dueComplaintAlert(c, "2026-10-23", new Set(["due_soon"]))).toBe("overdue");
    expect(dueComplaintAlert(c, "2026-10-24", new Set(["due_soon", "overdue"]))).toBeNull();
  });

  it("sends only the overdue email for one logged late", () => {
    expect(dueComplaintAlert(complaint(), "2026-10-30", new Set())).toBe("overdue");
  });

  it("stays quiet once responded or closed", () => {
    expect(dueComplaintAlert(complaint({ respondedOn: "2026-10-03" }), "2026-10-23", new Set())).toBeNull();
    expect(dueComplaintAlert(complaint({ closedOn: "2026-10-03" }), "2026-10-23", new Set())).toBeNull();
  });
});

describe("parseComplaintForm", () => {
  const today = "2026-10-05";
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    const base = { kind: "complaint", receivedOn: "2026-10-01", summary: "A parent says we shared her number with a tutor." };
    for (const [k, v] of Object.entries({ ...base, ...fields })) fd.set(k, v);
    return parseComplaintForm(fd, today);
  };
  const errors = (r: ReturnType<typeof form>) =>
    Object.fromEntries((r.error?.issues ?? []).map((i) => [String(i.path[0]), i.message]));

  it("accepts the minimum, and counts 21 days for a complaint", () => {
    const r = form({});
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ dueOn: "2026-10-22", respondedOn: null, closedOn: null, reference: "" });
  });

  it("keeps the date the letter gives", () => {
    expect(form({ dueOn: "2026-10-15" }).data?.dueOn).toBe("2026-10-15");
    expect(errors(form({ dueOn: "2026-09-30" }))).toHaveProperty("dueOn");
  });

  it("needs the notice's own date for anything but a complaint", () => {
    expect(errors(form({ kind: "enforcement_notice" }))).toHaveProperty("dueOn");
    expect(form({ kind: "enforcement_notice", dueOn: "2026-10-30" }).success).toBe(true);
  });

  it("requires the received date and rejects future dates", () => {
    expect(errors(form({ receivedOn: "" }))).toHaveProperty("receivedOn");
    expect(errors(form({ receivedOn: "2026-10-06" }))).toHaveProperty("receivedOn");
    expect(errors(form({ receivedOn: "2026-02-30" }))).toHaveProperty("receivedOn");
  });

  it("rejects a response before receipt, in the future, or without a date", () => {
    expect(errors(form({ respondedOn: "2026-09-30" }))).toHaveProperty("respondedOn");
    expect(errors(form({ respondedOn: "2026-10-06" }))).toHaveProperty("respondedOn");
    expect(errors(form({ response: "Sent our account by email." }))).toHaveProperty("respondedOn");
    expect(form({ respondedOn: "2026-10-03" }).success).toBe(true);
  });

  it("needs the closing date and the outcome together", () => {
    expect(errors(form({ closedOn: "2026-10-04" }))).toHaveProperty("outcome");
    expect(errors(form({ outcome: "Withdrawn by the complainant." }))).toHaveProperty("closedOn");
    expect(errors(form({ respondedOn: "2026-10-04", closedOn: "2026-10-03", outcome: "Dismissed." }))).toHaveProperty("closedOn");
    expect(form({ respondedOn: "2026-10-03", closedOn: "2026-10-04", outcome: "Dismissed." }).success).toBe(true);
  });

  it("rejects an unknown kind and an empty summary", () => {
    expect(errors(form({ kind: "summons" }))).toHaveProperty("kind");
    expect(errors(form({ summary: " " }))).toHaveProperty("summary");
  });
});

describe("runComplaintAlerts", () => {
  let db: Db;
  let outbox: EmailMessage[];
  const send = async (m: EmailMessage) => void outbox.push(m);
  // Noon in Nairobi on the given day.
  const on = (date: string) => new Date(`${date}T12:00:00+03:00`);

  beforeEach(async () => {
    const client = new PGlite();
    const pg = drizzle({ client, schema });
    await migrate(pg, { migrationsFolder: "drizzle" });
    db = pg as unknown as Db;
    outbox = [];
  });

  async function setup(over: Partial<typeof schema.complaints.$inferInsert> = {}) {
    const [o] = await db
      .insert(schema.organizations)
      .values({ name: "Sunrise Academy", sector: "education", size: "micro_small" })
      .returning();
    const [u] = await db
      .insert(schema.users)
      .values({ email: `owner-${o.id}@example.co.ke`, name: "Owner", passwordHash: "x", emailVerifiedAt: new Date() })
      .returning();
    await db.insert(schema.memberships).values({ userId: u.id, orgId: o.id, role: "owner" });
    const [c] = await db
      .insert(schema.complaints)
      .values({
        orgId: o.id,
        kind: "complaint",
        reference: "ODPC/CONF/1/5 (77)",
        receivedOn: "2026-10-01",
        dueOn: "2026-10-22",
        complainant: "Achieng Otieno",
        summary: "Shared a phone number.",
        ...over,
      })
      .returning();
    return { user: u, complaint: c };
  }

  it("warns owners as the deadline nears and again once it passes", async () => {
    const { user, complaint } = await setup();
    await runComplaintAlerts(db, send, { now: on("2026-10-16") });
    const r = await runComplaintAlerts(db, send, { now: on("2026-10-17"), appUrl: "https://app.test" });
    await runComplaintAlerts(db, send, { now: on("2026-10-18") });
    await runComplaintAlerts(db, send, { now: on("2026-10-23") });

    expect(r.sent).toEqual([{ complaintId: complaint.id, kind: "due_soon", to: [user.email] }]);
    expect(outbox.map((m) => m.subject)).toEqual([
      "Sunrise Academy: respond to the ODPC complaint (5 days left)",
      "Sunrise Academy: the ODPC complaint is overdue",
    ]);
    expect(outbox[0].text).toContain("https://app.test/complaints/" + complaint.id);
    expect(outbox[0].text).toContain("22 Oct 2026");
    expect(outbox[0].text).toContain("reference ODPC/CONF/1/5 (77)");
    expect(outbox[1].text).toContain("has passed");
  });

  it("never names the complainant", async () => {
    await setup();
    await runComplaintAlerts(db, send, { now: on("2026-10-17") });
    await runComplaintAlerts(db, send, { now: on("2026-10-23") });
    expect(outbox).toHaveLength(2);
    for (const m of outbox) expect(m.subject + m.text).not.toContain("Achieng");
  });

  it("words the email for the kind of notice", async () => {
    await setup({ kind: "enforcement_notice", dueOn: "2026-10-30" });
    await runComplaintAlerts(db, send, { now: on("2026-10-28") });
    expect(outbox[0].subject).toBe("Sunrise Academy: comply with the ODPC enforcement notice (2 days left)");
    expect(outbox[0].text).toContain("received an enforcement notice");
    expect(outbox[0].text).toContain("s.58");
  });

  it("uses Nairobi's date, not the server's", async () => {
    await setup();
    // 22:30 UTC on 16 Oct is already 17 Oct in Nairobi.
    await runComplaintAlerts(db, send, { now: new Date("2026-10-16T22:30:00Z") });
    expect(outbox).toHaveLength(1);
  });

  it("stops once it has been responded to or closed", async () => {
    const { complaint } = await setup();
    await setup({ closedOn: "2026-10-04", outcome: "Withdrawn." });
    await db.update(schema.complaints).set({ respondedOn: "2026-10-04" }).where(eq(schema.complaints.id, complaint.id));
    const r = await runComplaintAlerts(db, send, { now: on("2026-10-23") });
    expect(r.checked).toBe(0);
    expect(outbox).toHaveLength(0);
  });

  it("checks only the one asked for", async () => {
    const { complaint } = await setup();
    await setup();
    const r = await runComplaintAlerts(db, send, { now: on("2026-10-17"), complaintId: complaint.id });
    expect(r.checked).toBe(1);
    expect(outbox).toHaveLength(1);
  });

  it("decides on the current deadline when an edit lands mid-run", async () => {
    const { complaint } = await setup();
    // Move the deadline after the run has listed the complaint but before it claims an alert.
    const racing = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== "transaction") return Reflect.get(target, prop, receiver);
        return async (...args: Parameters<Db["transaction"]>) => {
          await target.update(schema.complaints).set({ dueOn: "2026-10-30" }).where(eq(schema.complaints.id, complaint.id));
          return target.transaction(...args);
        };
      },
    });
    const r = await runComplaintAlerts(racing, send, { now: on("2026-10-17") });
    expect(r.sent).toHaveLength(0);

    // The due-soon alert for the new deadline still goes out.
    await runComplaintAlerts(db, send, { now: on("2026-10-28") });
    expect(outbox.map((m) => m.subject)).toEqual(["Sunrise Academy: respond to the ODPC complaint (2 days left)"]);
  });

  it("releases the claim when sending fails, so the next run retries", async () => {
    await setup();
    const failing = async () => {
      throw new Error("SMTP down");
    };
    const r = await runComplaintAlerts(db, failing, { now: on("2026-10-17") });
    expect(r.failed).toHaveLength(1);
    await runComplaintAlerts(db, send, { now: on("2026-10-17") });
    expect(outbox).toHaveLength(1);
  });
});
