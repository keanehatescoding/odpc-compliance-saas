import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import type { EmailMessage } from "@/lib/email";
import {
  daysToRespond,
  dueRequestAlert,
  formatDaysLeft,
  requestStatus,
  respondedLate,
  responseDueOn,
  type RequestLike,
} from "@/lib/subject-request";
import { runSubjectRequestAlerts } from "@/lib/subject-request-alerts";
import { parseSubjectRequestForm } from "@/lib/subject-request-form";

const request = (over: Partial<RequestLike> = {}): RequestLike => ({
  kind: "access",
  receivedOn: "2026-10-01",
  outcome: null,
  respondedOn: null,
  ...over,
});

describe("response deadlines", () => {
  it("counts calendar days from receipt, by kind", () => {
    expect(responseDueOn(request({ kind: "access" }))).toBe("2026-10-08");
    expect(responseDueOn(request({ kind: "erasure" }))).toBe("2026-10-15");
    expect(responseDueOn(request({ kind: "portability" }))).toBe("2026-10-31");
    expect(responseDueOn(request({ kind: "marketing" }))).toBe("2026-10-08");
  });

  it("is open, then due soon, then overdue", () => {
    const r = request();
    expect(requestStatus(r, "2026-10-05")).toBe("open");
    expect(requestStatus(r, "2026-10-06")).toBe("due_soon");
    expect(requestStatus(r, "2026-10-08")).toBe("due_soon");
    expect(requestStatus(r, "2026-10-09")).toBe("overdue");
    expect(daysToRespond(r, "2026-10-09")).toBe(-1);
  });

  it("stops the clock once responded, and flags a late response", () => {
    const onTime = request({ outcome: "completed", respondedOn: "2026-10-08" });
    const late = request({ outcome: "declined", respondedOn: "2026-10-09" });
    expect(requestStatus(onTime, "2026-12-01")).toBe("completed");
    expect(requestStatus(late, "2026-12-01")).toBe("declined");
    expect(respondedLate(onTime)).toBe(false);
    expect(respondedLate(late)).toBe(true);
  });

  it("formats days left", () => {
    expect(formatDaysLeft(3)).toBe("3 days left");
    expect(formatDaysLeft(1)).toBe("1 day left");
    expect(formatDaysLeft(0)).toBe("due today");
    expect(formatDaysLeft(-2)).toBe("2 days overdue");
  });
});

describe("dueRequestAlert", () => {
  it("sends due-soon then overdue, once each", () => {
    const r = request();
    expect(dueRequestAlert(r, "2026-10-05", new Set())).toBeNull();
    expect(dueRequestAlert(r, "2026-10-06", new Set())).toBe("due_soon");
    expect(dueRequestAlert(r, "2026-10-07", new Set(["due_soon"]))).toBeNull();
    expect(dueRequestAlert(r, "2026-10-09", new Set(["due_soon"]))).toBe("overdue");
    expect(dueRequestAlert(r, "2026-10-10", new Set(["due_soon", "overdue"]))).toBeNull();
  });

  it("stays quiet once responded", () => {
    expect(dueRequestAlert(request({ outcome: "completed", respondedOn: "2026-10-03" }), "2026-10-09", new Set())).toBeNull();
  });
});

describe("parseSubjectRequestForm", () => {
  const today = "2026-10-05";
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    const base = { kind: "access", receivedOn: "2026-10-01", requesterName: "Achieng Otieno", details: "Copy of my son's records." };
    for (const [k, v] of Object.entries({ ...base, ...fields })) fd.set(k, v);
    return parseSubjectRequestForm(fd, today);
  };
  const errors = (r: ReturnType<typeof form>) =>
    Object.fromEntries((r.error?.issues ?? []).map((i) => [String(i.path[0]), i.message]));

  it("accepts the minimum needed to log a request", () => {
    const r = form({});
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ outcome: null, respondedOn: null, representative: "" });
  });

  it("requires the received date and rejects future dates", () => {
    expect(errors(form({ receivedOn: "" }))).toHaveProperty("receivedOn");
    expect(errors(form({ receivedOn: "2026-10-06" }))).toHaveProperty("receivedOn");
    expect(errors(form({ receivedOn: "2026-02-30" }))).toHaveProperty("receivedOn");
  });

  it("needs the outcome and response date together", () => {
    expect(errors(form({ outcome: "completed" }))).toHaveProperty("respondedOn");
    expect(errors(form({ respondedOn: "2026-10-03" }))).toHaveProperty("outcome");
    expect(form({ outcome: "completed", respondedOn: "2026-10-03" }).success).toBe(true);
  });

  it("rejects a response before receipt or in the future", () => {
    expect(errors(form({ outcome: "completed", respondedOn: "2026-09-30" }))).toHaveProperty("respondedOn");
    expect(errors(form({ outcome: "completed", respondedOn: "2026-10-06" }))).toHaveProperty("respondedOn");
  });

  it("requires reasons for declining", () => {
    expect(errors(form({ outcome: "declined", respondedOn: "2026-10-03" }))).toHaveProperty("response");
    expect(form({ outcome: "declined", respondedOn: "2026-10-03", response: "Not someone whose data we hold." }).success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(errors(form({ kind: "delete_everything" }))).toHaveProperty("kind");
  });
});

describe("runSubjectRequestAlerts", () => {
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

  async function setup(over: Partial<typeof schema.subjectRequests.$inferInsert> = {}) {
    const [o] = await db
      .insert(schema.organizations)
      .values({ name: "Sunrise Academy", sector: "education", size: "micro_small" })
      .returning();
    const [u] = await db
      .insert(schema.users)
      .values({ email: `owner-${o.id}@example.co.ke`, name: "Owner", passwordHash: "x", emailVerifiedAt: new Date() })
      .returning();
    await db.insert(schema.memberships).values({ userId: u.id, orgId: o.id, role: "owner" });
    const [r] = await db
      .insert(schema.subjectRequests)
      .values({ orgId: o.id, kind: "access", receivedOn: "2026-10-01", requesterName: "Achieng Otieno", details: "Records.", ...over })
      .returning();
    return { user: u, request: r };
  }

  it("warns owners as the deadline nears and again once it passes", async () => {
    const { user, request } = await setup();
    await runSubjectRequestAlerts(db, send, { now: on("2026-10-05") });
    const r = await runSubjectRequestAlerts(db, send, { now: on("2026-10-06"), appUrl: "https://app.test" });
    await runSubjectRequestAlerts(db, send, { now: on("2026-10-07") });
    await runSubjectRequestAlerts(db, send, { now: on("2026-10-09") });

    expect(r.sent).toEqual([{ requestId: request.id, kind: "due_soon", to: [user.email] }]);
    expect(outbox.map((m) => m.subject)).toEqual([
      "Sunrise Academy: respond to access request from Achieng Otieno (2 days left)",
      "Sunrise Academy: response to access request from Achieng Otieno is overdue",
    ]);
    expect(outbox[0].text).toContain("https://app.test/requests/" + request.id);
    expect(outbox[0].text).toContain("by 8 Oct 2026");
  });

  it("uses Nairobi's date, not the server's", async () => {
    await setup();
    // 22:30 UTC on 5 Oct is already 6 Oct in Nairobi.
    await runSubjectRequestAlerts(db, send, { now: new Date("2026-10-05T22:30:00Z") });
    expect(outbox).toHaveLength(1);
  });

  it("stops once the request has been answered", async () => {
    const { request } = await setup();
    await db
      .update(schema.subjectRequests)
      .set({ outcome: "completed", respondedOn: "2026-10-04" })
      .where(eq(schema.subjectRequests.id, request.id));
    const r = await runSubjectRequestAlerts(db, send, { now: on("2026-10-09") });
    expect(r.checked).toBe(0);
    expect(outbox).toHaveLength(0);
  });

  it("decides on the current deadline when an edit lands mid-run", async () => {
    const { request } = await setup();
    // Move the deadline after the run has listed the request but before it claims an alert.
    const racing = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== "transaction") return Reflect.get(target, prop, receiver);
        return async (...args: Parameters<Db["transaction"]>) => {
          await target
            .update(schema.subjectRequests)
            .set({ receivedOn: "2026-10-05" })
            .where(eq(schema.subjectRequests.id, request.id));
          return target.transaction(...args);
        };
      },
    });
    const r = await runSubjectRequestAlerts(racing, send, { now: on("2026-10-06") });
    expect(r.sent).toHaveLength(0);

    // The due-soon alert for the new deadline still goes out.
    await runSubjectRequestAlerts(db, send, { now: on("2026-10-10") });
    expect(outbox.map((m) => m.subject)).toEqual([
      "Sunrise Academy: respond to access request from Achieng Otieno (2 days left)",
    ]);
  });

  it("releases the claim when sending fails, so the next run retries", async () => {
    await setup();
    const failing = async () => {
      throw new Error("SMTP down");
    };
    const r = await runSubjectRequestAlerts(db, failing, { now: on("2026-10-06") });
    expect(r.failed).toHaveLength(1);
    await runSubjectRequestAlerts(db, send, { now: on("2026-10-06") });
    expect(outbox).toHaveLength(1);
  });
});
