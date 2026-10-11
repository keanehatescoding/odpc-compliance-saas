import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db";
import {
  activityLog,
  billingAlertLog,
  breachActivities,
  breachAlertLog,
  breaches,
  breachUpdates,
  dpiaRisks,
  dpias,
  etimsInvoices,
  invitations,
  memberships,
  organizations,
  payments,
  processingActivities,
  processorActivities,
  processors,
  refunds,
  registrations,
  reminderLog,
  renewalAttempts,
  savedCards,
  serviceOrders,
  subjectRequestAlertLog,
  subjectRequests,
  trainingSessions,
  users,
  type SavedCard,
} from "@/db/schema";
import { recordActivity } from "./activity";
import type { EmailMessage } from "./email";
import { TAX_RECORD_YEARS } from "./legal";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// ---------------------------------------------------------------------------
// Export: everything Kinga holds about an organisation, as JSON.
// ---------------------------------------------------------------------------

export const EXPORT_FORMAT = "kinga-export/1";

/**
 * Every record the organisation keeps in Kinga, for owners and admins to take
 * elsewhere. Leaves out secrets (password hashes, invitation tokens, the card's
 * Paystack authorization) and our own bookkeeping, such as retry state.
 */
export async function exportOrganization(db: Db | Tx, orgId: string, now: Date = new Date()) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) return null;

  const [team, invited, regs, activities, breachRows, dpiaRows, requests, processorRows, trainingRows, paymentRows, orders, card, history] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email, role: memberships.role, joinedAt: memberships.createdAt })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, orgId))
      .orderBy(asc(memberships.createdAt)),
    db
      .select({ email: invitations.email, role: invitations.role, invitedBy: invitations.invitedBy, expiresAt: invitations.expiresAt, createdAt: invitations.createdAt })
      .from(invitations)
      .where(eq(invitations.orgId, orgId)),
    db.select().from(registrations).where(eq(registrations.orgId, orgId)).orderBy(asc(registrations.createdAt)),
    db.select().from(processingActivities).where(eq(processingActivities.orgId, orgId)).orderBy(asc(processingActivities.createdAt)),
    db.select().from(breaches).where(eq(breaches.orgId, orgId)).orderBy(asc(breaches.discoveredAt)),
    db.select().from(dpias).where(eq(dpias.orgId, orgId)).orderBy(asc(dpias.createdAt)),
    db.select().from(subjectRequests).where(eq(subjectRequests.orgId, orgId)).orderBy(asc(subjectRequests.receivedOn)),
    db.select().from(processors).where(eq(processors.orgId, orgId)).orderBy(asc(processors.createdAt)),
    db.select().from(trainingSessions).where(eq(trainingSessions.orgId, orgId)).orderBy(asc(trainingSessions.heldOn)),
    db
      .select()
      .from(payments)
      .where(and(eq(payments.orgId, orgId), eq(payments.status, "succeeded")))
      .orderBy(asc(payments.paidAt)),
    db.select().from(serviceOrders).where(eq(serviceOrders.orgId, orgId)).orderBy(asc(serviceOrders.createdAt)),
    db.select().from(savedCards).where(eq(savedCards.orgId, orgId)),
    db.select().from(activityLog).where(eq(activityLog.orgId, orgId)).orderBy(asc(activityLog.createdAt), asc(activityLog.id)),
  ]);

  const ids = <T extends { id: string }>(rows: T[]) => rows.map((r) => r.id);
  const [reminders, affected, updates, breachAlerts, risks, requestAlerts, handled, refundRows, invoices] = await Promise.all([
    db.select().from(reminderLog).where(inArray(reminderLog.registrationId, ids(regs))).orderBy(asc(reminderLog.sentAt)),
    db.select().from(breachActivities).where(inArray(breachActivities.breachId, ids(breachRows))),
    db.select().from(breachUpdates).where(inArray(breachUpdates.breachId, ids(breachRows))).orderBy(asc(breachUpdates.createdAt)),
    db.select().from(breachAlertLog).where(inArray(breachAlertLog.breachId, ids(breachRows))).orderBy(asc(breachAlertLog.sentAt)),
    db.select().from(dpiaRisks).where(inArray(dpiaRisks.dpiaId, ids(dpiaRows))).orderBy(asc(dpiaRisks.position)),
    db
      .select()
      .from(subjectRequestAlertLog)
      .where(inArray(subjectRequestAlertLog.requestId, ids(requests)))
      .orderBy(asc(subjectRequestAlertLog.sentAt)),
    db.select().from(processorActivities).where(inArray(processorActivities.processorId, ids(processorRows))),
    db.select().from(refunds).where(inArray(refunds.paymentId, ids(paymentRows))).orderBy(asc(refunds.refundedAt)),
    db.select().from(etimsInvoices).where(inArray(etimsInvoices.paymentId, ids(paymentRows))).orderBy(asc(etimsInvoices.invcNo)),
  ]);

  const by = <T, K extends keyof T>(rows: T[], key: K, value: T[K]) => rows.filter((r) => r[key] === value);
  const invoice = (i: (typeof invoices)[number]) => ({
    invoiceNumber: i.invcNo,
    status: i.status,
    receiptNumber: i.rcptNo,
    internalData: i.intrlData,
    signature: i.rcptSign,
    signedAt: i.sdcDateTime,
  });

  return {
    format: EXPORT_FORMAT,
    exportedAt: now.toISOString(),
    organization: {
      id: org.id,
      name: org.name,
      sector: org.sector,
      size: org.size,
      kraPin: org.kraPin,
      reminderEmail: org.reminderEmail,
      trialEndsAt: org.trialEndsAt,
      paidUntil: org.paidUntil,
      autoRenewInterval: org.autoRenewInterval,
      createdAt: org.createdAt,
    },
    team,
    invitations: invited,
    registrations: regs.map(({ orgId: _o, ...r }) => ({
      ...r,
      remindersSent: by(reminders, "registrationId", r.id).map(({ id: _i, registrationId: _r, ...m }) => m),
    })),
    processingActivities: activities.map(({ orgId: _o, ...a }) => a),
    breaches: breachRows.map(({ orgId: _o, ...b }) => ({
      ...b,
      affectedActivityIds: by(affected, "breachId", b.id).map((a) => a.activityId),
      incidentLog: by(updates, "breachId", b.id).map(({ id: _i, breachId: _b, ...u }) => u),
      alertsSent: by(breachAlerts, "breachId", b.id).map(({ id: _i, breachId: _b, ...a }) => a),
    })),
    impactAssessments: dpiaRows.map(({ orgId: _o, ...d }) => ({
      ...d,
      risks: by(risks, "dpiaId", d.id).map(({ id: _i, dpiaId: _d, ...r }) => r),
    })),
    subjectRequests: requests.map(({ orgId: _o, ...r }) => ({
      ...r,
      alertsSent: by(requestAlerts, "requestId", r.id).map(({ id: _i, requestId: _r, ...a }) => a),
    })),
    processors: processorRows.map(({ orgId: _o, ...p }) => ({
      ...p,
      activityIds: by(handled, "processorId", p.id).map((h) => h.activityId),
    })),
    trainingSessions: trainingRows.map(({ orgId: _o, ...t }) => t),
    payments: paymentRows.map((p) => {
      const sale = invoices.find((i) => i.paymentId === p.id && i.refundId === null);
      return {
        receiptNumber: p.receiptNumber,
        kind: p.kind,
        interval: p.interval,
        service: p.service,
        amount: p.amount / 100,
        currency: p.currency,
        channel: p.channel,
        paidAt: p.paidAt,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        billedName: p.billedName,
        billedKraPin: p.billedKraPin,
        startedBy: p.startedBy,
        etimsInvoice: sale ? invoice(sale) : null,
        refunds: by(refundRows, "paymentId", p.id).map((r) => {
          const note = invoices.find((i) => i.refundId === r.id);
          return { amount: r.amount / 100, currency: r.currency, refundedAt: r.refundedAt, etimsCreditNote: note ? invoice(note) : null };
        }),
      };
    }),
    serviceOrders: orders.map((o) => ({
      id: o.id,
      service: paymentRows.find((p) => p.id === o.paymentId)?.service ?? null,
      status: o.status,
      notes: o.notes,
      requestedBy: o.requestedBy,
      deliveredAt: o.deliveredAt,
      createdAt: o.createdAt,
    })),
    activityLog: history.map(({ orgId: _o, id: _i, ...a }) => a),
    savedCard: card[0]
      ? { brand: card[0].brand, last4: card[0].last4, expMonth: card[0].expMonth, expYear: card[0].expYear, savedAt: card[0].createdAt }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Deleting an organisation.
// ---------------------------------------------------------------------------

export type DeleteOrganizationResult =
  | { error: string }
  | { ok: true; orgName: string; team: { name: string; email: string }[]; card: SavedCard | null };

/**
 * Deletes an organisation's records and team, for one of its owners. Paid
 * payments stay, with their refunds and eTIMS invoices, because tax law
 * says to keep them; they already carry the name and KRA PIN they were billed
 * to. So does the organisation row they belong to, marked deleted, and any
 * checkout still pending, so a payment that lands afterwards is recognised
 * (and refunded by hand) instead of going unrecorded. Refuses while a paid
 * service order hasn't been delivered or cancelled. The caller deactivates
 * the returned card on Paystack and tells the team.
 */
export async function deleteOrganization(
  db: Db,
  p: { orgId: string; actorId: string },
  now: Date = new Date(),
): Promise<DeleteOrganizationResult> {
  return db.transaction(async (tx) => {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, p.orgId)).for("update");
    const team = await lockTeam(tx, p.orgId);
    if (!org || org.deletedAt) return { error: "This organisation has already been deleted." };
    if (team.find((m) => m.userId === p.actorId)?.role !== "owner") return { error: "Only an owner can delete the organisation." };

    const [openOrder] = await tx
      .select({ id: serviceOrders.id })
      .from(serviceOrders)
      .where(and(eq(serviceOrders.orgId, p.orgId), inArray(serviceOrders.status, ["paid", "in_progress"])))
      .limit(1);
    if (openOrder) {
      return { error: "You have a paid service order we haven't finished. Contact us to have it delivered or cancelled and refunded first." };
    }

    const people = await tx
      .select({ name: users.name, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, p.orgId));
    const [card] = await tx.delete(savedCards).where(eq(savedCards.orgId, p.orgId)).returning();

    // DPIAs before the activities they point to; the rest cascade to their logs and children.
    await tx.delete(dpias).where(eq(dpias.orgId, p.orgId));
    await tx.delete(breaches).where(eq(breaches.orgId, p.orgId));
    await tx.delete(processingActivities).where(eq(processingActivities.orgId, p.orgId));
    await tx.delete(registrations).where(eq(registrations.orgId, p.orgId));
    await tx.delete(subjectRequests).where(eq(subjectRequests.orgId, p.orgId));
    await tx.delete(processors).where(eq(processors.orgId, p.orgId));
    await tx.delete(trainingSessions).where(eq(trainingSessions.orgId, p.orgId));
    await tx.delete(serviceOrders).where(eq(serviceOrders.orgId, p.orgId));
    await tx.delete(renewalAttempts).where(eq(renewalAttempts.orgId, p.orgId));
    await tx.delete(billingAlertLog).where(eq(billingAlertLog.orgId, p.orgId));
    await tx.delete(invitations).where(eq(invitations.orgId, p.orgId));
    await tx.delete(memberships).where(eq(memberships.orgId, p.orgId));
    // It names the team and what they did, so it goes with them.
    await tx.delete(activityLog).where(eq(activityLog.orgId, p.orgId));
    await tx.delete(payments).where(and(eq(payments.orgId, p.orgId), eq(payments.status, "failed")));
    // Pending checkouts lose who started them; paid ones keep it until that account goes.
    await tx
      .update(payments)
      .set({ startedBy: null })
      .where(and(eq(payments.orgId, p.orgId), ne(payments.status, "succeeded")));
    await tx
      .update(organizations)
      .set({ deletedAt: now, reminderEmail: null, autoRenewInterval: null })
      .where(eq(organizations.id, p.orgId));

    return { ok: true, orgName: org.name, team: people, card: card ?? null };
  });
}

/** The org's memberships, locked so team changes queue behind each other (as in lib/team). */
async function lockTeam(tx: Tx, orgId: string) {
  return tx
    .select({ userId: memberships.userId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.orgId, orgId))
    .for("update");
}

export function organizationDeletedEmail(
  to: string,
  p: { orgName: string; deletedBy: { name: string; email: string }; appUrl: string; contact: string | null },
): EmailMessage {
  return {
    to: [to],
    subject: `${p.orgName} has been deleted from Kinga`,
    text: [
      "Hello,",
      "",
      `${p.deletedBy.name} (${p.deletedBy.email}) deleted ${p.orgName} from Kinga. Its registrations, records of processing, impact assessments, breach log, data subject requests and team are gone, and any saved card has been removed. Nothing will be charged again.`,
      "",
      `We keep its receipts and eTIMS invoices for ${TAX_RECORD_YEARS} years, as tax law requires.`,
      "",
      `Your Kinga account still exists. To set up a new organisation, or delete your account, sign in at:`,
      "",
      `${p.appUrl}/login`,
      ...(p.contact ? ["", `If you didn't expect this, contact us at ${p.contact}.`] : []),
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Deleting an account.
// ---------------------------------------------------------------------------

/**
 * Deletes a user's account: their sessions, links and memberships go with it,
 * and records they wrote stay with the organisation, no longer attributed.
 * Returns an error to show instead if they're the organisation's only owner.
 */
export async function deleteAccount(db: Db, userId: string): Promise<string | null> {
  return db.transaction(async (tx) => {
    // An account belongs to at most one organisation (see acceptInvitation).
    const [membership] = await tx
      .select({ orgId: memberships.orgId, orgName: organizations.name })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(eq(memberships.userId, userId));
    // Under the team lock, so two owners can't both leave at once.
    const team = membership ? await lockTeam(tx, membership.orgId) : [];
    // From the locked team, since the organisation may have been deleted since the read above.
    const member = team.find((m) => m.userId === userId);
    if (membership && member?.role === "owner") {
      if (team.filter((m) => m.role === "owner").length === 1) {
        return team.length === 1
          ? `You're the only person in ${membership.orgName}. Delete the organisation first, then your account.`
          : `You're the only owner of ${membership.orgName}. Make someone else an owner, or delete the organisation first.`;
      }
    }
    // Logged while the account exists, so the entry carries their name.
    if (membership && member) {
      await recordActivity(tx, { orgId: membership.orgId, actorId: userId, area: "team", subjectId: userId, summary: "deleted their account and left the team" });
    }
    await tx.delete(users).where(eq(users.id, userId));
    return null;
  });
}
