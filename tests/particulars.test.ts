import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import type { EmailMessage } from "@/lib/email";
import {
  addedActivitiesChange,
  affectsRegistration,
  daysToNotify,
  dueParticularChangeAlert,
  logChangeHref,
  notifiedLate,
  notifyBy,
  organizationParticularChange,
  particularChangeStatus,
  ropaHref,
  ropaParticularChange,
  suggestionFor,
  suggestionFromQuery,
  type ActivityLike,
} from "@/lib/particulars";
import { runParticularChangeAlerts } from "@/lib/particulars-alerts";
import { parseParticularChangeForm } from "@/lib/particulars-form";

describe("deadlines", () => {
  const change = { changedOn: "2026-10-01", notifiedOn: null };

  it("gives 14 days from the change", () => {
    expect(notifyBy(change)).toBe("2026-10-15");
    expect(daysToNotify(change, "2026-10-15")).toBe(0);
    expect(daysToNotify(change, "2026-10-16")).toBe(-1);
  });

  it("is due, then due soon, then overdue", () => {
    expect(particularChangeStatus(change, "2026-10-09")).toBe("due");
    expect(particularChangeStatus(change, "2026-10-10")).toBe("due_soon");
    expect(particularChangeStatus(change, "2026-10-15")).toBe("due_soon");
    expect(particularChangeStatus(change, "2026-10-16")).toBe("overdue");
  });

  it("is done once notified, and flags a late notice", () => {
    expect(particularChangeStatus({ ...change, notifiedOn: "2026-10-15" }, "2026-12-01")).toBe("notified");
    expect(notifiedLate({ ...change, notifiedOn: "2026-10-15" })).toBe(false);
    expect(notifiedLate({ ...change, notifiedOn: "2026-10-16" })).toBe(true);
    expect(notifiedLate(change)).toBe(false);
  });
});

describe("dueParticularChangeAlert", () => {
  const change = { changedOn: "2026-10-01", notifiedOn: null };

  it("sends due-soon then overdue, once each", () => {
    expect(dueParticularChangeAlert(change, "2026-10-09", new Set())).toBeNull();
    expect(dueParticularChangeAlert(change, "2026-10-10", new Set())).toBe("due_soon");
    expect(dueParticularChangeAlert(change, "2026-10-11", new Set(["due_soon"]))).toBeNull();
    expect(dueParticularChangeAlert(change, "2026-10-16", new Set(["due_soon"]))).toBe("overdue");
    expect(dueParticularChangeAlert(change, "2026-10-17", new Set(["due_soon", "overdue"]))).toBeNull();
  });

  it("sends only the overdue email for one logged late, and nothing once notified", () => {
    expect(dueParticularChangeAlert(change, "2026-10-20", new Set())).toBe("overdue");
    expect(dueParticularChangeAlert({ ...change, notifiedOn: "2026-10-20" }, "2026-10-20", new Set())).toBeNull();
  });
});

describe("spotting changes", () => {
  const activity = (over: Partial<ActivityLike> = {}): ActivityLike => ({
    name: "Fee payments",
    role: "controller",
    purpose: "Collecting school fees",
    dataSubjects: ["parents"],
    dataCategories: ["contact", "financial"],
    sensitiveCategories: [],
    recipients: "Bank",
    crossBorder: false,
    transferCountries: "",
    transferSafeguards: "",
    securityMeasures: "Access control",
    retention: "7 years",
    ...over,
  });

  it("suggests a notice for a new or stopped activity", () => {
    expect(ropaParticularChange(null, activity())).toEqual({
      role: "controller",
      description: "Added the processing activity “Fee payments”: Collecting school fees",
    });
    expect(ropaParticularChange(activity({ role: null }), null)).toEqual({
      role: null,
      description: "Stopped the processing activity “Fee payments”",
    });
  });

  it("names the registered particulars an edit changed, and ignores the rest", () => {
    expect(ropaParticularChange(activity(), activity({ retention: "5 years", name: "Fees" }))).toBeNull();
    // The order of a list doesn't matter.
    expect(ropaParticularChange(activity(), activity({ dataCategories: ["financial", "contact"] }))).toBeNull();
    expect(ropaParticularChange(activity(), activity({ crossBorder: true, transferCountries: "Ireland", recipients: "Bank, SMS service" }))).toEqual({
      role: "controller",
      description: "Changed the recipients, transfers outside Kenya, transfer countries of the processing activity “Fee payments”",
    });
    expect(ropaParticularChange(activity(), activity({ transferSafeguards: "Standard contractual clauses" }))?.description).toBe(
      "Changed the transfer safeguards of the processing activity “Fee payments”",
    );
  });

  it("covers both registrations when the role changes", () => {
    expect(ropaParticularChange(activity(), activity({ role: "processor" }))?.role).toBeNull();
  });

  it("groups activities added together", () => {
    expect(addedActivitiesChange([])).toBeNull();
    expect(addedActivitiesChange([activity()])?.description).toContain("Collecting school fees");
    expect(addedActivitiesChange([activity(), activity({ name: "CCTV" })])).toEqual({
      role: "controller",
      description: "Added the processing activities “Fee payments”, “CCTV”",
    });
    expect(addedActivitiesChange([activity(), activity({ name: "Payroll", role: "processor" })])?.role).toBeNull();
  });

  it("spots changes to the organisation's registered details", () => {
    const before = { name: "Sunrise Academy", kraPin: "P051234567X", address: "Nakuru", privacyEmail: "dpo@sunrise.ac.ke", sector: "education" };
    expect(organizationParticularChange(before, { ...before, sector: "health" })).toBeNull();
    expect(organizationParticularChange(before, { ...before, address: "Lanet, Nakuru", privacyEmail: "privacy@sunrise.ac.ke" })).toEqual({
      role: null,
      description: "Changed the organisation's address, contact email",
    });
  });

  it("only applies to an issued certificate for the role", () => {
    const regs = [
      { role: "controller", issuedOn: "2025-01-10" },
      { role: "processor", issuedOn: null },
    ];
    expect(affectsRegistration("controller", regs)).toBe(true);
    expect(affectsRegistration("processor", regs)).toBe(false);
    expect(affectsRegistration(null, regs)).toBe(true);
    expect(affectsRegistration(null, [{ role: "processor", issuedOn: null }])).toBe(false);
  });

  it("narrows a change to both registrations to the only certificate held", () => {
    const change = { role: null, description: "Changed the organisation's address" };
    const controllerOnly = [
      { role: "controller", issuedOn: "2025-01-10" },
      { role: "processor", issuedOn: null },
    ];
    const both = [
      { role: "controller", issuedOn: "2025-01-10" },
      { role: "processor", issuedOn: "2025-03-01" },
    ];
    expect(suggestionFor(change, controllerOnly)).toEqual({ ...change, role: "controller" });
    expect(suggestionFor(change, both)).toEqual(change);
    expect(suggestionFor({ ...change, role: "processor" }, controllerOnly)).toBeNull();
    expect(suggestionFor(change, [])).toBeNull();
    expect(suggestionFor(null, both)).toBeNull();
  });

  it("carries a suggestion through the address and back", () => {
    expect(ropaHref(null)).toBe("/ropa");
    const change = { role: null, description: "Stopped the processing activity “CCTV”" };
    const href = ropaHref(change);
    const query = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(suggestionFromQuery(query)).toEqual(change);
    // The day of the edit comes back too, so a prompt reopened later dates the change right.
    const dated = { ...change, changedOn: "2026-10-01" };
    expect(suggestionFromQuery(Object.fromEntries(new URL(ropaHref(dated), "http://x").searchParams))).toEqual(dated);
    expect(suggestionFromQuery({ changed: "both", what: "x", on: "yesterday" })).toEqual({ role: null, description: "x" });
    expect(suggestionFromQuery({ changed: "admin", what: "x" })).toBeNull();
    expect(suggestionFromQuery({ changed: "controller", what: "  " })).toBeNull();
    expect(suggestionFromQuery({ changed: "controller", what: ["a", "b"] })).toBeNull();
    expect(suggestionFromQuery({ changed: "processor", what: "x".repeat(900) })?.description).toHaveLength(500);
  });

  it("links to the form filled in", () => {
    const href = logChangeHref({ role: "processor", description: "New recipient" }, "2026-10-01");
    const params = new URL(href, "http://x").searchParams;
    expect(href.startsWith("/registrations/changes/new?")).toBe(true);
    expect(Object.fromEntries(params)).toEqual({ role: "processor", what: "New recipient", changedOn: "2026-10-01" });
    expect(new URL(logChangeHref({ role: null, description: "x" }), "http://x").searchParams.has("role")).toBe(false);
  });
});

describe("parseParticularChangeForm", () => {
  const today = "2026-10-05";
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    const base = { role: "controller", changedOn: "2026-10-01", description: "Moved to new offices in Lanet." };
    for (const [k, v] of Object.entries({ ...base, ...fields })) fd.set(k, v);
    return parseParticularChangeForm(fd, today);
  };
  const errors = (r: ReturnType<typeof form>) =>
    Object.fromEntries((r.error?.issues ?? []).map((i) => [String(i.path[0]), i.message]));

  it("accepts the minimum, and stores both registrations as no role", () => {
    expect(form({}).data).toMatchObject({ role: "controller", changedOn: "2026-10-01", notifiedOn: null, notifiedHow: "" });
    expect(form({ role: "both" }).data?.role).toBeNull();
  });

  it("requires the date of the change, not in the future", () => {
    expect(errors(form({ changedOn: "" }))).toHaveProperty("changedOn");
    expect(errors(form({ changedOn: "2026-10-06" }))).toHaveProperty("changedOn");
    expect(errors(form({ changedOn: "2026-02-30" }))).toHaveProperty("changedOn");
  });

  it("needs the notice date with how it was sent, not in the future", () => {
    expect(errors(form({ notifiedHow: "Emailed the ODPC." }))).toHaveProperty("notifiedOn");
    expect(errors(form({ notifiedOn: "2026-10-06" }))).toHaveProperty("notifiedOn");
    expect(form({ notifiedOn: "2026-10-04", notifiedHow: "Emailed the ODPC." }).success).toBe(true);
  });

  it("rejects an unknown registration and an empty description", () => {
    expect(errors(form({ role: "admin" }))).toHaveProperty("role");
    expect(errors(form({ description: " " }))).toHaveProperty("description");
  });
});

describe("runParticularChangeAlerts", () => {
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

  async function setup(over: Partial<typeof schema.particularChanges.$inferInsert> = {}) {
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
      .insert(schema.particularChanges)
      .values({ orgId: o.id, role: "controller", changedOn: "2026-10-01", description: "Moved to new offices in Lanet.", ...over })
      .returning();
    return { user: u, change: c };
  }

  it("warns owners as the deadline nears and again once it passes", async () => {
    const { user, change } = await setup();
    await runParticularChangeAlerts(db, send, { now: on("2026-10-09") });
    const r = await runParticularChangeAlerts(db, send, { now: on("2026-10-10"), appUrl: "https://app.test" });
    await runParticularChangeAlerts(db, send, { now: on("2026-10-11") });
    await runParticularChangeAlerts(db, send, { now: on("2026-10-16") });

    expect(r.sent).toEqual([{ changeId: change.id, kind: "due_soon", to: [user.email] }]);
    expect(outbox.map((m) => m.subject)).toEqual([
      "Sunrise Academy: tell the ODPC about a change to your registration (5 days left)",
      "Sunrise Academy: the ODPC hasn't been told of a change to your registration",
    ]);
    expect(outbox[0].text).toContain("https://app.test/registrations/changes/" + change.id);
    expect(outbox[0].text).toContain("15 Oct 2026");
    expect(outbox[0].text).toContain("the controller registration");
    expect(outbox[0].text).toContain("Moved to new offices in Lanet.");
    expect(outbox[1].text).toContain("offence");
  });

  it("uses Nairobi's date, not the server's", async () => {
    await setup();
    // 22:30 UTC on 9 Oct is already 10 Oct in Nairobi.
    await runParticularChangeAlerts(db, send, { now: new Date("2026-10-09T22:30:00Z") });
    expect(outbox).toHaveLength(1);
  });

  it("stops once the ODPC has been told", async () => {
    await setup({ notifiedOn: "2026-10-05", notifiedHow: "Letter" });
    const r = await runParticularChangeAlerts(db, send, { now: on("2026-10-16") });
    expect(r.checked).toBe(0);
    expect(outbox).toHaveLength(0);
  });

  it("passes over changes with nothing left to send", async () => {
    await setup({ changedOn: "2026-10-05" });
    // Not due soon until 10 Oct.
    expect((await runParticularChangeAlerts(db, send, { now: on("2026-10-09") })).checked).toBe(0);
    await runParticularChangeAlerts(db, send, { now: on("2026-10-20") });
    expect(outbox).toHaveLength(1);
    // The overdue alert is the last one.
    expect((await runParticularChangeAlerts(db, send, { now: on("2026-10-21") })).checked).toBe(0);
  });

  it("sends once when two runs overlap", async () => {
    await setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let entered!: () => void;
    const sending = new Promise<void>((resolve) => (entered = resolve));
    const slow = async (m: EmailMessage) => {
      entered();
      await gate;
      outbox.push(m);
    };
    // The first run holds its claim while the second runs through.
    const first = runParticularChangeAlerts(db, slow, { now: on("2026-10-10") });
    await sending;
    const second = await runParticularChangeAlerts(db, send, { now: on("2026-10-10") });
    release();
    const r = await first;
    expect(second.sent).toHaveLength(0);
    expect(r.sent).toHaveLength(1);
    expect(outbox).toHaveLength(1);
  });

  it("checks only the one asked for", async () => {
    const { change } = await setup();
    await setup();
    const r = await runParticularChangeAlerts(db, send, { now: on("2026-10-10"), changeId: change.id });
    expect(r.checked).toBe(1);
    expect(outbox).toHaveLength(1);
  });

  it("decides on the current date when an edit lands mid-run", async () => {
    const { change } = await setup();
    const racing = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== "transaction") return Reflect.get(target, prop, receiver);
        return async (...args: Parameters<Db["transaction"]>) => {
          await target.update(schema.particularChanges).set({ changedOn: "2026-10-04" }).where(eq(schema.particularChanges.id, change.id));
          return target.transaction(...args);
        };
      },
    });
    const r = await runParticularChangeAlerts(racing, send, { now: on("2026-10-10") });
    expect(r.sent).toHaveLength(0);

    await runParticularChangeAlerts(db, send, { now: on("2026-10-15") });
    expect(outbox.map((m) => m.subject)).toEqual(["Sunrise Academy: tell the ODPC about a change to your registration (3 days left)"]);
  });

  it("releases the claim when sending fails, so the next run retries", async () => {
    await setup();
    const failing = async () => {
      throw new Error("SMTP down");
    };
    const r = await runParticularChangeAlerts(db, failing, { now: on("2026-10-10") });
    expect(r.failed).toHaveLength(1);
    await runParticularChangeAlerts(db, send, { now: on("2026-10-10") });
    expect(outbox).toHaveLength(1);
  });
});
