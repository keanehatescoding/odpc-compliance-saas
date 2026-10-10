import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { deleteAccount, deleteOrganization, EXPORT_FORMAT, exportOrganization, organizationDeletedEmail } from "@/lib/account";
import { recordPayment } from "@/lib/billing";
import type { PaystackTransaction } from "@/lib/paystack";
import { createAccountFromInvitation, issueInvitation } from "@/lib/team";

const {
  breachActivities,
  breaches,
  dpiaRisks,
  dpias,
  etimsInvoices,
  invitations,
  memberships,
  organizations,
  payments,
  processingActivities,
  refunds,
  registrations,
  savedCards,
  serviceOrders,
  processorActivities,
  processors,
  subjectRequests,
  trainingSessions,
  users,
} = schema;

let db: Db;
let orgId: string;
let owner: string;
let admin: string;
let member: string;
let paidId: string;

const t0 = new Date("2026-10-06T09:00:00Z");

async function addUser(email: string): Promise<string> {
  const [u] = await db
    .insert(users)
    .values({ email, name: email.split("@")[0], passwordHash: "scrypt$secret-hash", emailVerifiedAt: t0 })
    .returning({ id: users.id });
  return u.id;
}

async function addPayment(values: Partial<typeof payments.$inferInsert> & { reference: string }) {
  const [p] = await db
    .insert(payments)
    .values({ orgId, kind: "subscription", interval: "month", amount: 200_000, currency: "KES", startedBy: owner, ...values })
    .returning({ id: payments.id });
  return p.id;
}

const paid = (reference: string, amount = 200_000): PaystackTransaction => ({
  reference,
  status: "success",
  amount,
  currency: "KES",
  channel: "mobile_money",
  paidAt: t0,
});

beforeEach(async () => {
  const client = new PGlite();
  const pg = drizzle({ client, schema });
  await migrate(pg, { migrationsFolder: "drizzle" });
  db = pg as unknown as Db;

  const [o] = await db
    .insert(organizations)
    .values({ name: "Sunrise Academy", sector: "education", size: "micro_small", kraPin: "P051234567X", reminderEmail: "dpo@sunrise.ke" })
    .returning({ id: organizations.id });
  orgId = o.id;
  owner = await addUser("owner@sunrise.ke");
  admin = await addUser("admin@sunrise.ke");
  member = await addUser("member@sunrise.ke");
  await db.insert(memberships).values([
    { orgId, userId: owner, role: "owner" },
    { orgId, userId: admin, role: "admin" },
    { orgId, userId: member, role: "member" },
  ]);

  // A bit of everything.
  await db.insert(registrations).values({ orgId, role: "controller", certificateNumber: "ODPC-1" });
  const [activity] = await db
    .insert(processingActivities)
    .values({ orgId, name: "Admissions", purpose: "Admit pupils", lawfulBasis: "contract", retentionPeriod: "7 years" })
    .returning({ id: processingActivities.id });
  const [breach] = await db
    .insert(breaches)
    .values({ orgId, title: "Lost laptop", kind: "loss_theft", description: "Left in a matatu", discoveredAt: t0, reportedBy: admin })
    .returning({ id: breaches.id });
  await db.insert(breachActivities).values({ breachId: breach.id, activityId: activity.id });
  const [dpia] = await db.insert(dpias).values({ orgId, activityId: activity.id, title: "CCTV", createdBy: owner }).returning({ id: dpias.id });
  await db.insert(dpiaRisks).values({ dpiaId: dpia.id, position: 0, description: "Over-collection", likelihood: "possible", severity: "significant", residualLikelihood: "remote", residualSeverity: "minimal" });
  await db.insert(subjectRequests).values({ orgId, kind: "access", receivedOn: "2026-10-01", requesterName: "Wanjiku", details: "All my data" });
  const [processor] = await db.insert(processors).values({ orgId, name: "Elimu Systems", service: "Hosts the school system" }).returning({ id: processors.id });
  await db.insert(processorActivities).values({ processorId: processor.id, activityId: activity.id });
  const [induction] = await db
    .insert(trainingSessions)
    .values({ orgId, title: "Induction", heldOn: "2025-09-01", audience: "All staff", topics: "The basics" })
    .returning({ id: trainingSessions.id });
  await db.insert(trainingSessions).values({ orgId, title: "Refresher", heldOn: "2026-09-01", audience: "All staff", topics: "The basics again", refreshesId: induction.id });
  await issueInvitation(db, { orgId, actorId: owner, email: "new@sunrise.ke", role: "member" }, t0);

  paidId = await addPayment({ reference: "paid-1" });
  await recordPayment(db, paid("paid-1"), t0, true);
  const [refund] = await db
    .insert(refunds)
    .values({ paymentId: paidId, paystackId: "rf-1", amount: 50_000, currency: "KES", refundedAt: t0 })
    .returning({ id: refunds.id });
  await db.insert(etimsInvoices).values({ paymentId: paidId, refundId: refund.id });
  await db.insert(savedCards).values({ orgId, authorizationCode: "AUTH_secret", email: "owner@sunrise.ke", brand: "visa", last4: "4081", savedBy: owner });
});

describe("exportOrganization", () => {
  it("includes every record and leaves out secrets", async () => {
    const data = await exportOrganization(db, orgId, t0);
    expect(data).not.toBeNull();
    expect(data!.format).toBe(EXPORT_FORMAT);
    expect(data!.organization).toMatchObject({ name: "Sunrise Academy", kraPin: "P051234567X" });
    expect(data!.team.map((m) => m.role).sort()).toEqual(["admin", "member", "owner"]);
    expect(data!.invitations).toEqual([expect.objectContaining({ email: "new@sunrise.ke", role: "member" })]);
    expect(data!.registrations).toEqual([expect.objectContaining({ certificateNumber: "ODPC-1", remindersSent: [] })]);
    expect(data!.processingActivities).toHaveLength(1);
    expect(data!.breaches[0].affectedActivityIds).toEqual([data!.processingActivities[0].id]);
    expect(data!.impactAssessments[0].risks).toEqual([expect.objectContaining({ description: "Over-collection" })]);
    expect(data!.subjectRequests).toEqual([expect.objectContaining({ requesterName: "Wanjiku", alertsSent: [] })]);
    expect(data!.processors).toEqual([expect.objectContaining({ name: "Elimu Systems", activityIds: [data!.processingActivities[0].id] })]);
    expect(data!.trainingSessions).toEqual([
      expect.objectContaining({ title: "Induction", refreshesId: null }),
      expect.objectContaining({ title: "Refresher", refreshesId: data!.trainingSessions[0].id }),
    ]);
    expect(data!.trainingSessions[0]).not.toHaveProperty("orgId");
    expect(data!.payments).toEqual([
      expect.objectContaining({
        amount: 2000,
        billedName: "Sunrise Academy",
        etimsInvoice: expect.objectContaining({ status: "pending" }),
        refunds: [expect.objectContaining({ amount: 500, etimsCreditNote: expect.objectContaining({ status: "pending" }) })],
      }),
    ]);
    expect(data!.savedCard).toEqual(expect.objectContaining({ brand: "visa", last4: "4081" }));

    const json = JSON.stringify(data);
    expect(json).not.toContain("secret");
    expect(json).not.toContain("tokenHash");
    expect(json).not.toContain("authorizationCode");
  });

  it("works for an organisation with nothing in it, and leaves out unpaid checkouts", async () => {
    const [empty] = await db.insert(organizations).values({ name: "Empty", sector: "education", size: "micro_small" }).returning();
    const data = await exportOrganization(db, empty.id, t0);
    expect(data).toMatchObject({ team: [], registrations: [], breaches: [], payments: [], savedCard: null });

    await addPayment({ reference: "pending-1" });
    expect((await exportOrganization(db, orgId, t0))!.payments).toHaveLength(1);
  });
});

describe("deleteOrganization", () => {
  it("refuses anyone but an owner", async () => {
    expect(await deleteOrganization(db, { orgId, actorId: admin }, t0)).toEqual({ error: "Only an owner can delete the organisation." });
    expect(await deleteOrganization(db, { orgId, actorId: member }, t0)).toHaveProperty("error");
  });

  it("deletes records, team and card, and keeps paid payments with their refunds and invoices", async () => {
    const pendingId = await addPayment({ reference: "pending-1" });
    await addPayment({ reference: "failed-1", status: "failed" });

    const r = await deleteOrganization(db, { orgId, actorId: owner }, t0);
    if ("error" in r) throw new Error(r.error);
    expect(r.orgName).toBe("Sunrise Academy");
    expect(r.team.map((m) => m.email).sort()).toEqual(["admin@sunrise.ke", "member@sunrise.ke", "owner@sunrise.ke"]);
    expect(r.card?.authorizationCode).toBe("AUTH_secret");

    for (const table of [registrations, processingActivities, breaches, dpias, subjectRequests, processors, processorActivities, trainingSessions, invitations, memberships, savedCards]) {
      expect(await db.select().from(table)).toEqual([]);
    }
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    expect(org).toMatchObject({ deletedAt: t0, reminderEmail: null, autoRenewInterval: null });

    const left = await db.select().from(payments);
    expect(left.map((p) => p.reference).sort()).toEqual(["paid-1", "pending-1"]);
    expect(left.find((p) => p.id === paidId)).toMatchObject({ status: "succeeded", billedName: "Sunrise Academy", startedBy: owner });
    expect(left.find((p) => p.id === pendingId)?.startedBy).toBeNull();
    expect(await db.select().from(refunds)).toHaveLength(1);
    expect(await db.select().from(etimsInvoices)).toHaveLength(2);

    // People keep their accounts.
    expect(await db.select().from(users)).toHaveLength(3);
    expect(await deleteOrganization(db, { orgId, actorId: owner }, t0)).toHaveProperty("error");
  });

  it("refuses while a paid service order is open, and allows it once delivered", async () => {
    const serviceId = await addPayment({ reference: "svc-1", kind: "service", interval: null, service: "dpia_review" });
    const [order] = await db.insert(serviceOrders).values({ orgId, paymentId: serviceId, status: "paid" }).returning();
    expect(await deleteOrganization(db, { orgId, actorId: owner }, t0)).toEqual({ error: expect.stringContaining("service order") });
    expect(await db.select().from(memberships)).toHaveLength(3);

    await db.update(serviceOrders).set({ status: "delivered" }).where(eq(serviceOrders.id, order.id));
    expect(await deleteOrganization(db, { orgId, actorId: owner }, t0)).toHaveProperty("ok", true);
    expect(await db.select().from(serviceOrders)).toEqual([]);
  });

  it("makes a checkout paid afterwards come back as org_deleted, uncredited", async () => {
    await addPayment({ reference: "late-1" });
    await deleteOrganization(db, { orgId, actorId: owner }, t0);
    expect(await recordPayment(db, paid("late-1"), t0, true)).toEqual({ result: "org_deleted", orgId });
    const [late] = await db.select().from(payments).where(eq(payments.reference, "late-1"));
    expect(late.status).toBe("pending");
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    expect(org.paidUntil?.getTime()).toBe((await db.select().from(payments).where(eq(payments.id, paidId)))[0].periodEnd?.getTime());
  });

  it("writes an email naming who deleted it", () => {
    const email = organizationDeletedEmail("admin@sunrise.ke", {
      orgName: "Sunrise Academy",
      deletedBy: { name: "Owner", email: "owner@sunrise.ke" },
      appUrl: "https://kinga.example",
      contact: "help@kinga.example",
    });
    expect(email.subject).toBe("Sunrise Academy has been deleted from Kinga");
    expect(email.text).toContain("Owner (owner@sunrise.ke) deleted Sunrise Academy");
    expect(email.text).toContain("https://kinga.example/login");
    expect(email.text).toContain("help@kinga.example");
    expect(organizationDeletedEmail("x@y.ke", { orgName: "A", deletedBy: { name: "B", email: "b@y.ke" }, appUrl: "u", contact: null }).text).not.toContain(
      "contact us",
    );
  });
});

describe("deleteAccount", () => {
  it("deletes a member, leaving what they wrote unattributed", async () => {
    expect(await deleteAccount(db, admin)).toBeNull();
    expect(await db.select().from(users).where(eq(users.id, admin))).toEqual([]);
    expect(await db.select().from(memberships)).toHaveLength(2);
    const [breach] = await db.select().from(breaches);
    expect(breach.reportedBy).toBeNull();
  });

  it("refuses the only owner, until there's another", async () => {
    expect(await deleteAccount(db, owner)).toContain("only owner of Sunrise Academy");
    await db.update(memberships).set({ role: "owner" }).where(eq(memberships.userId, admin));
    expect(await deleteAccount(db, owner)).toBeNull();
  });

  it("asks a lone owner to delete the organisation first", async () => {
    await db.delete(memberships).where(eq(memberships.role, "admin"));
    await db.delete(memberships).where(eq(memberships.role, "member"));
    expect(await deleteAccount(db, owner)).toContain("only person in Sunrise Academy");
    await deleteOrganization(db, { orgId, actorId: owner }, t0);
    expect(await deleteAccount(db, owner)).toBeNull();
    // Their paid payment stays, no longer attributed.
    const [p] = await db.select().from(payments).where(eq(payments.id, paidId));
    expect(p.startedBy).toBeNull();
  });
});

describe("terms acceptance", () => {
  it("records the version agreed to when joining by invitation", async () => {
    const r = await issueInvitation(db, { orgId, actorId: owner, email: "joiner@sunrise.ke", role: "member" }, t0);
    if ("error" in r) throw new Error(r.error);
    const id = await createAccountFromInvitation(db, r.token, { name: "Joiner", passwordHash: "x", termsVersion: "2026-10-06" }, t0);
    const [u] = await db.select().from(users).where(eq(users.id, id!));
    expect(u).toMatchObject({ termsVersion: "2026-10-06", termsAcceptedAt: t0 });
  });
});
