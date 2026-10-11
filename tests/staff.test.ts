import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { recordPayment } from "@/lib/billing";
import { TRIAL_DAYS } from "@/lib/plans";
import {
  isStaff,
  matchesFilter,
  openServiceOrderCount,
  orgDetail,
  orgSummaries,
  overview,
  staffEmails,
  staffServiceOrders,
} from "@/lib/staff";

const { invitations, memberships, organizations, payments, processingActivities, registrations, renewalAttempts, serviceOrders, users } =
  schema;

const DAY = 24 * 60 * 60 * 1000;
const t0 = new Date("2026-10-05T09:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);

let db: Db;

async function addOrg(name: string, values: Partial<typeof organizations.$inferInsert> = {}) {
  const [o] = await db
    .insert(organizations)
    .values({ name, sector: "education", size: "medium", trialEndsAt: later(TRIAL_DAYS * DAY), createdAt: t0, ...values })
    .returning();
  return o;
}

async function addMember(orgId: string, email: string, role: "owner" | "admin" | "member", verified = true) {
  const [u] = await db
    .insert(users)
    .values({ email, name: email.split("@")[0], passwordHash: "x", emailVerifiedAt: verified ? t0 : null })
    .returning();
  await db.insert(memberships).values({ orgId, userId: u.id, role });
  return u;
}

async function addServiceOrder(orgId: string, requestedBy: string, reference: string, status: "paid" | "in_progress" | "delivered") {
  const [p] = await db
    .insert(payments)
    .values({ orgId, reference, kind: "service", service: "compliance_audit", amount: 4_500_000, currency: "KES" })
    .returning();
  await recordPayment(db, { reference, status: "success", amount: p.amount, currency: "KES", channel: "card", paidAt: t0 }, t0);
  const [o] = await db.insert(serviceOrders).values({ orgId, paymentId: p.id, status, notes: "Everything", requestedBy }).returning();
  return o;
}

beforeEach(async () => {
  const client = new PGlite();
  const pg = drizzle({ client, schema });
  await migrate(pg, { migrationsFolder: "drizzle" });
  db = pg as unknown as Db;
});

describe("who is staff", () => {
  const env = { STAFF_EMAILS: " Ops@Kinga.co.ke, ,founder@kinga.co.ke " } as unknown as NodeJS.ProcessEnv;

  it("reads a comma-separated, case-insensitive list", () => {
    expect([...staffEmails(env)]).toEqual(["ops@kinga.co.ke", "founder@kinga.co.ke"]);
    expect(staffEmails({} as NodeJS.ProcessEnv).size).toBe(0);
  });

  it("lets in only listed addresses that have been confirmed", () => {
    expect(isStaff({ email: "OPS@kinga.co.ke", emailVerifiedAt: t0 }, env)).toBe(true);
    expect(isStaff({ email: "ops@kinga.co.ke", emailVerifiedAt: null }, env)).toBe(false);
    expect(isStaff({ email: "owner@school.ke", emailVerifiedAt: t0 }, env)).toBe(false);
    expect(isStaff({ email: "ops@kinga.co.ke", emailVerifiedAt: t0 }, {} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("organisation summaries", () => {
  it("counts each organisation's records and team, and finds its owners and last change", async () => {
    const a = await addOrg("Sunrise Academy");
    const b = await addOrg("Mji Clinic", { createdAt: later(DAY) });
    const owner = await addMember(a.id, "owner@sunrise.ke", "owner");
    await addMember(a.id, "teacher@sunrise.ke", "member");
    await addMember(b.id, "nurse@mji.ke", "owner", false);

    await db.insert(registrations).values({ orgId: a.id, role: "controller" });
    await db.insert(processingActivities).values(
      ["Admissions", "Fees"].map((name) => ({ orgId: a.id, name, purpose: "x", lawfulBasis: "contract", retentionPeriod: "7 years" })),
    );
    await recordActivity(db, { orgId: a.id, actorId: owner.id, area: "ropa", summary: "added a RoPA activity" }, later(2 * DAY));

    const [clinic, school] = await orgSummaries(db, t0);
    expect(clinic.org.name).toBe("Mji Clinic");
    expect(clinic.counts).toEqual({ registrations: 0, ropa: 0, dpias: 0, breaches: 0, requests: 0, processors: 0, training: 0, consents: 0 });
    expect(clinic.owners).toEqual([{ name: "nurse", email: "nurse@mji.ke", verified: false }]);
    expect(clinic.lastChangeAt).toBeNull();

    expect(school.counts).toEqual({ registrations: 1, ropa: 2, dpias: 0, breaches: 0, requests: 0, processors: 0, training: 0, consents: 0 });
    expect(school.teamSize).toBe(2);
    expect(school.owners.map((o) => o.email)).toEqual(["owner@sunrise.ke"]);
    expect(school.lastChangeAt).toEqual(later(2 * DAY));
    expect(school.access.state).toBe("trial");
  });

  it("files organisations under trial, paying, lapsed and deleted", async () => {
    await addOrg("Trial ending", { trialEndsAt: later(3 * DAY) });
    await addOrg("Trial", { trialEndsAt: later(10 * DAY) });
    await addOrg("Paying", { trialEndsAt: later(-30 * DAY), paidUntil: later(20 * DAY), autoRenewInterval: "month" });
    await addOrg("Lapsed", { trialEndsAt: later(-1 * DAY) });
    await addOrg("Gone", { deletedAt: t0, paidUntil: later(20 * DAY) });

    const all = await orgSummaries(db, t0);
    const names = (filter: Parameters<typeof matchesFilter>[1]) =>
      all.filter((s) => matchesFilter(s, filter)).map((s) => s.org.name).sort();
    expect(names("all")).toEqual(["Lapsed", "Paying", "Trial", "Trial ending"]);
    expect(names("trial")).toEqual(["Trial", "Trial ending"]);
    expect(names("active")).toEqual(["Paying"]);
    expect(names("lapsed")).toEqual(["Lapsed"]);
    expect(names("deleted")).toEqual(["Gone"]);
    expect(overview(all)).toEqual({ trial: 2, trialEnding: 1, active: 1, lapsed: 1, autoRenew: 1 });
  });
});

describe("an organisation's detail", () => {
  it("returns null for an organisation that doesn't exist", async () => {
    expect(await orgDetail(db, "00000000-0000-0000-0000-000000000000", t0)).toBeNull();
  });

  it("lists the team, counts live invitations, and shows payments and renewal charges", async () => {
    const org = await addOrg("Sunrise Academy");
    const owner = await addMember(org.id, "owner@sunrise.ke", "owner");
    await db.insert(invitations).values([
      { orgId: org.id, tokenHash: "a", email: "new@sunrise.ke", role: "member", expiresAt: later(DAY) },
      { orgId: org.id, tokenHash: "b", email: "old@sunrise.ke", role: "member", expiresAt: later(-DAY) },
    ]);
    const [sub] = await db
      .insert(payments)
      .values({ orgId: org.id, reference: "sub-1", kind: "subscription", interval: "month", amount: 500_000, currency: "KES" })
      .returning();
    await recordPayment(db, { reference: "sub-1", status: "success", amount: 500_000, currency: "KES", channel: "card", paidAt: t0 }, t0);
    await db.insert(payments).values({ orgId: org.id, reference: "never-paid", kind: "subscription", interval: "month", amount: 500_000, currency: "KES" });
    await db.insert(renewalAttempts).values([
      { orgId: org.id, endsAt: later(30 * DAY), attempt: 1, paymentId: sub.id, createdAt: later(DAY) },
      { orgId: org.id, endsAt: later(60 * DAY), attempt: 1, error: "Insufficient funds", createdAt: later(2 * DAY) },
    ]);
    await addServiceOrder(org.id, owner.id, "svc-1", "paid");

    const d = (await orgDetail(db, org.id, t0))!;
    expect(d.team.map((m) => [m.email, m.role])).toEqual([["owner@sunrise.ke", "owner"]]);
    expect(d.pendingInvitations).toBe(1);
    expect(d.payments.map((p) => p.reference).sort()).toEqual(["sub-1", "svc-1"]);
    expect(d.renewals.map((r) => [r.attempt.error, r.paymentStatus])).toEqual([
      ["Insufficient funds", null],
      [null, "succeeded"],
    ]);
    expect(d.orders).toHaveLength(1);
    expect(d.access.state).toBe("active");
  });
});

describe("the service order queue", () => {
  it("lists open orders with their organisation and who ordered them", async () => {
    const org = await addOrg("Sunrise Academy");
    const owner = await addMember(org.id, "owner@sunrise.ke", "owner");
    const open = await addServiceOrder(org.id, owner.id, "svc-1", "paid");
    const started = await addServiceOrder(org.id, owner.id, "svc-2", "in_progress");
    await addServiceOrder(org.id, owner.id, "svc-3", "delivered");

    const queue = await staffServiceOrders(db);
    expect(queue.map((q) => q.order.id).sort()).toEqual([open.id, started.id].sort());
    expect(queue[0].org.name).toBe("Sunrise Academy");
    expect(queue[0].requester).toMatchObject({ name: "owner", email: "owner@sunrise.ke" });
    expect(await openServiceOrderCount(db)).toBe(2);
  });

  it("is empty with no orders", async () => {
    expect(await staffServiceOrders(db)).toEqual([]);
    expect(await openServiceOrderCount(db)).toBe(0);
  });
});
