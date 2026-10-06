import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { billingAlertLog, organizations, payments, renewalAttempts, savedCards, type Organization, type SavedCard } from "@/db/schema";
import { afterPaymentCredited } from "./after-payment";
import { CURRENCY, recordPayment } from "./billing";
import { formatDate, todayInKenya } from "./dates";
import { formatKsh, type OrgSize } from "./dpa";
import type { SendEmail } from "./email";
import { PaystackError, type Paystack, type PaystackTransaction } from "./paystack";
import {
  accessFor,
  cardLabel,
  dueRenewalAttempt,
  nextRenewalAttemptAt,
  PLAN_PRICES,
  RENEWAL_ATTEMPTS,
  RENEWAL_GIVE_UP_MS,
  toSubunits,
  willAutoRenew,
  type BillingInterval,
} from "./plans";
import { ownerEmails } from "./reminders";

const DAY = 86_400_000;
/** Paystack statuses for a charge that hasn't finished either way. */
const STILL_GOING = new Set(["pending", "ongoing", "processing", "queued"]);
/** How long after an attempt is claimed Paystack may not yet know of its charge. */
const IN_FLIGHT_MS = 10 * 60_000;

export async function savedCardFor(db: Db, orgId: string): Promise<SavedCard | null> {
  const [card] = await db.select().from(savedCards).where(eq(savedCards.orgId, orgId)).limit(1);
  return card ?? null;
}

/**
 * Our reference for a renewal charge, the same each time it's worked out, so
 * Paystack refuses a second charge for the same attempt even if our claim is lost.
 */
export function renewalReference(orgId: string, endsAt: Date, attempt: number): string {
  return `kinga-renew-${orgId.replaceAll("-", "")}-${Math.floor(endsAt.getTime() / 1000)}-${attempt}`;
}

export interface RenewalRunResult {
  checked: number;
  renewed: { orgId: string; paymentId: string }[];
  declined: { orgId: string; attempt: number; reason: string; renewalOff: boolean }[];
  /** Charges whose outcome isn't known yet; the webhook or the next run settles them. */
  pending: { orgId: string; reference: string }[];
  /** Errors in the job itself, such as Paystack being unreachable. */
  failed: { orgId: string; error: string }[];
}

interface Claimed {
  orgId: string;
  orgName: string;
  endsAt: Date;
  attempt: number;
  attemptId: string;
  paymentId: string;
  reference: string;
  amount: number;
  interval: BillingInterval;
  card: SavedCard;
}

/**
 * Charges saved cards for organisations whose access is about to end, or has
 * just ended, and that have automatic renewal on. Each attempt is claimed in
 * renewal_attempts first, with its pending payment, so it's safe to run often
 * and from more than one place. A charge that goes through is credited as any
 * payment is; one that's declined emails the owners, and after the last
 * attempt turns renewal off.
 */
export async function runAutoRenewals(
  db: Db,
  paystack: Paystack,
  sendEmail: SendEmail,
  opts: { now?: Date; appUrl?: string } = {},
): Promise<RenewalRunResult> {
  const now = opts.now ?? new Date();
  const appUrl = opts.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  const result: RenewalRunResult = { checked: 0, renewed: [], declined: [], pending: [], failed: [] };

  const endsAt = sql`greatest(${organizations.trialEndsAt}, coalesce(${organizations.paidUntil}, ${organizations.trialEndsAt}))`;
  const candidates = await db
    .select({ id: organizations.id })
    .from(organizations)
    .innerJoin(savedCards, eq(savedCards.orgId, organizations.id))
    .where(
      sql`${organizations.autoRenewInterval} is not null and ${endsAt} between
        ${new Date(now.getTime() - RENEWAL_GIVE_UP_MS).toISOString()}::timestamptz
        and ${new Date(now.getTime() + DAY).toISOString()}::timestamptz`,
    );

  for (const { id } of candidates) {
    result.checked++;
    try {
      // An earlier charge whose outcome we never heard settles first, so a
      // slow one can't be followed by a second charge for the same period.
      if (!(await settlePendingRenewal(db, paystack, sendEmail, id, now, appUrl, result))) continue;
      const claim = await claimRenewal(db, id, now);
      if (!claim) continue;
      let txn: Awaited<ReturnType<Paystack["chargeAuthorization"]>> | null;
      try {
        txn = await chargeClaimed(db, paystack, claim);
        if (!txn) continue;
      } catch (err) {
        // A bad key (401, 403) or rate limiting (429) says nothing about the card. Those
        // are errors in the job: the payment stays pending, and the next run looks it up.
        if (err instanceof PaystackError && err.status >= 400 && err.status < 500 && ![401, 403, 429].includes(err.status)) {
          await declineRenewal(db, sendEmail, claim, err.reason ?? "Paystack refused the charge", appUrl, result);
          continue;
        }
        // It may or may not have gone through. The payment stays pending: the
        // webhook credits it if it did, and the next run looks it up.
        throw err;
      }
      await settleCharge(db, sendEmail, claim, txn, txn.paused, txn.gatewayResponse, now, appUrl, result);
    } catch (err) {
      result.failed.push({ orgId: id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}

/**
 * Looks up the organisation's latest renewal charge still marked pending, and
 * settles it. Returns false if it's still going, so no new charge is made.
 */
async function settlePendingRenewal(
  db: Db,
  paystack: Paystack,
  sendEmail: SendEmail,
  orgId: string,
  now: Date,
  appUrl: string,
  result: RenewalRunResult,
): Promise<boolean> {
  const [row] = await db
    .select({ attempt: renewalAttempts, payment: payments })
    .from(renewalAttempts)
    .innerJoin(payments, eq(payments.id, renewalAttempts.paymentId))
    .where(and(eq(renewalAttempts.orgId, orgId), eq(payments.status, "pending")))
    .orderBy(desc(renewalAttempts.createdAt))
    .limit(1);
  if (!row) return true;
  const claim = await claimDetails(db, row.attempt, row.payment);
  if (!claim) return true;

  let txn: PaystackTransaction;
  try {
    txn = await paystack.verify(row.payment.reference);
  } catch (err) {
    if (err instanceof PaystackError && (err.status === 400 || err.status === 404)) {
      // Another run may still be making this charge, and Paystack not know of it yet.
      if (now.getTime() - row.attempt.createdAt.getTime() < IN_FLIGHT_MS) {
        result.pending.push({ orgId, reference: row.payment.reference });
        return false;
      }
      // Paystack never saw it, so it wasn't charged. Forget the attempt so it's made
      // again, unless it was credited or declined meanwhile (under the same lock).
      await db.transaction(async (tx) => {
        await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId)).for("update");
        const [gone] = await tx
          .delete(payments)
          .where(and(eq(payments.id, row.payment.id), eq(payments.status, "pending")))
          .returning({ id: payments.id });
        if (gone) await tx.delete(renewalAttempts).where(eq(renewalAttempts.id, row.attempt.id));
      });
      return true;
    }
    throw err;
  }
  await settleCharge(db, sendEmail, claim, txn, false, null, now, appUrl, result);
  return !STILL_GOING.has(txn.status);
}

async function claimDetails(
  db: Db,
  attempt: typeof renewalAttempts.$inferSelect,
  payment: typeof payments.$inferSelect,
): Promise<Claimed | null> {
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, attempt.orgId));
  const card = await savedCardFor(db, attempt.orgId);
  if (!org || !card) return null;
  return {
    orgId: attempt.orgId,
    orgName: org.name,
    endsAt: attempt.endsAt,
    attempt: attempt.attempt,
    attemptId: attempt.id,
    paymentId: payment.id,
    reference: payment.reference,
    amount: payment.amount,
    interval: payment.interval as BillingInterval,
    card,
  };
}

/**
 * Claims the attempt due now, if any, and records its pending payment, under
 * a lock on the organisation (as crediting a payment takes), so a payment
 * that lands meanwhile moves the end date and nothing is charged.
 */
async function claimRenewal(db: Db, orgId: string, now: Date): Promise<Claimed | null> {
  return db.transaction(async (tx) => {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId)).for("update");
    const [card] = await tx.select().from(savedCards).where(eq(savedCards.orgId, orgId));
    if (!org || !card) return null;
    const { endsAt } = accessFor(org, now);
    if (!willAutoRenew(org, card, endsAt)) return null;
    const attempt = dueRenewalAttempt(endsAt, now);
    if (!attempt) return null;

    const [claimed] = await tx
      .insert(renewalAttempts)
      // Timed by our clock, which is what IN_FLIGHT_MS is measured against.
      .values({ orgId, endsAt, attempt, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: renewalAttempts.id });
    if (!claimed) return null;

    const interval = org.autoRenewInterval;
    const amount = toSubunits(PLAN_PRICES[org.size as OrgSize][interval]);
    const reference = renewalReference(orgId, endsAt, attempt);
    const [payment] = await tx
      .insert(payments)
      .values({ orgId, reference, kind: "subscription", interval, amount, currency: CURRENCY, startedBy: card.savedBy })
      .onConflictDoNothing()
      .returning({ id: payments.id });
    // A payment with this reference already exists: this attempt was made before
    // and its claim since lost. Don't charge again.
    if (!payment) return null;
    await tx.update(renewalAttempts).set({ paymentId: payment.id }).where(eq(renewalAttempts.id, claimed.id));
    return {
      orgId,
      orgName: org.name,
      endsAt,
      attempt,
      attemptId: claimed.id,
      paymentId: payment.id,
      reference,
      amount,
      interval,
      card,
    };
  });
}

/**
 * Makes the claimed charge, holding the organisation's lock while Paystack
 * answers (at most its request timeout), so the organisation can't be deleted,
 * nor the card removed or renewal turned off, between the last check and the
 * charge. If one of those happened since the claim, drops the claim instead
 * and returns null. Once the request is made the lock goes; a charge whose
 * outcome is still open settles later, as any payment does. Meanwhile it holds
 * a pooled connection, and that organisation's billing changes and payments
 * wait; organisations are charged one at a time, so a run holds one at most
 * (README, "Scheduling reminders and alerts").
 */
async function chargeClaimed(db: Db, paystack: Paystack, claim: Claimed) {
  return db.transaction(async (tx) => {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, claim.orgId)).for("update");
    const [card] = await tx.select().from(savedCards).where(eq(savedCards.orgId, claim.orgId));
    if (!org || org.deletedAt || !org.autoRenewInterval || card?.authorizationCode !== claim.card.authorizationCode) {
      await tx.delete(renewalAttempts).where(eq(renewalAttempts.id, claim.attemptId));
      await tx.delete(payments).where(and(eq(payments.id, claim.paymentId), eq(payments.status, "pending")));
      return null;
    }
    return paystack.chargeAuthorization({
      authorizationCode: claim.card.authorizationCode,
      email: claim.card.email,
      amount: claim.amount,
      currency: CURRENCY,
      reference: claim.reference,
      metadata: { orgId: claim.orgId, interval: claim.interval, renewal: String(claim.attempt) },
    });
  });
}

async function settleCharge(
  db: Db,
  sendEmail: SendEmail,
  claim: Claimed,
  txn: PaystackTransaction,
  paused: boolean,
  gatewayResponse: string | null,
  now: Date,
  appUrl: string,
  result: RenewalRunResult,
): Promise<void> {
  if (txn.status === "success" && !paused) {
    // Credit as of when it was paid, so a charge made before the period ended
    // but confirmed after still runs on from the end, without a gap.
    const paidAt = txn.paidAt && txn.paidAt < now ? txn.paidAt : now;
    const recorded = await recordPayment(db, txn, paidAt);
    if (recorded.result === "credited") {
      await afterPaymentCredited(db, sendEmail, recorded);
      result.renewed.push({ orgId: claim.orgId, paymentId: recorded.paymentId });
    } else if (recorded.result === "already_credited") {
      result.renewed.push({ orgId: claim.orgId, paymentId: claim.paymentId });
    } else {
      result.failed.push({ orgId: claim.orgId, error: `Renewal ${claim.reference} couldn't be credited: ${recorded.result}` });
    }
    return;
  }
  if (!paused && STILL_GOING.has(txn.status)) {
    result.pending.push({ orgId: claim.orgId, reference: claim.reference });
    return;
  }
  const reason = paused
    ? "your bank asked for the charge to be approved, which can't be done for an automatic payment"
    : (gatewayResponse ?? "the charge was declined");
  await declineRenewal(db, sendEmail, claim, reason, appUrl, result);
}

/**
 * A renewal charge failed: marks it so, tells the owners, and after the last
 * attempt turns automatic renewal off (the card stays saved). That last email
 * also says access has ended, so it stands in for the usual "ended" email.
 */
async function declineRenewal(
  db: Db,
  sendEmail: SendEmail,
  claim: Claimed,
  reason: string,
  appUrl: string,
  result: RenewalRunResult,
): Promise<void> {
  const next = nextRenewalAttemptAt(claim.endsAt, claim.attempt);
  const to = await ownerEmails(db, claim.orgId);
  await db.transaction(async (tx) => {
    await tx.update(payments).set({ status: "failed" }).where(and(eq(payments.id, claim.paymentId), eq(payments.status, "pending")));
    await tx.update(renewalAttempts).set({ error: reason }).where(eq(renewalAttempts.id, claim.attemptId));
    if (!next) {
      // Only if renewal is still on for the same period: a payment or a change since then wins.
      await tx
        .update(organizations)
        .set({ autoRenewInterval: null })
        .where(
          and(
            eq(organizations.id, claim.orgId),
            sql`greatest(${organizations.trialEndsAt}, coalesce(${organizations.paidUntil}, ${organizations.trialEndsAt})) = ${claim.endsAt.toISOString()}::timestamptz`,
          ),
        );
      if (to.length > 0) {
        await tx
          .insert(billingAlertLog)
          .values({ orgId: claim.orgId, kind: "ended", endsAt: claim.endsAt, recipients: to })
          .onConflictDoNothing();
      }
    }
  });
  result.declined.push({ orgId: claim.orgId, attempt: claim.attempt, reason, renewalOff: !next });
  if (to.length === 0) return;
  try {
    await sendEmail(renewalFailedEmail(to, claim, reason, next, `${appUrl}/billing`));
  } catch (err) {
    console.error("Failed to send renewal failure email", claim.orgId, err);
  }
}

export function renewalFailedEmail(
  to: string[],
  claim: Pick<Claimed, "orgName" | "endsAt" | "amount" | "interval" | "card">,
  reason: string,
  next: Date | null,
  link: string,
) {
  const card = cardLabel(claim.card);
  const ends = formatDate(todayInKenya(claim.endsAt));
  const lapsedLine = next
    ? `We'll try again on ${formatDate(todayInKenya(next))}. To pay now, by M-Pesa or another card, go to:`
    : `We've stopped trying and turned automatic renewal off. ${claim.orgName}'s subscription ended on ${ends}, so Kinga is read-only until someone pays. You can still see and export all your records and log and manage data breaches. To pay, by M-Pesa or card, go to:`;
  return {
    to,
    subject: next
      ? `${claim.orgName}: we couldn't charge your card for Kinga`
      : `${claim.orgName}: your Kinga subscription has ended`,
    text: [
      "Hello,",
      "",
      `We tried to charge ${formatKsh(claim.amount / 100)} to the ${card} for another ${claim.interval} of Kinga, but it didn't go through: ${reason}.`,
      "",
      lapsedLine,
      "",
      link,
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Turning renewal on and off, and removing the card, from the Billing page.
// Owners are emailed when renewal stops, since the subscription will then end.
// ---------------------------------------------------------------------------

export type RenewalChangeResult = { ok: true } | { error: string };

export async function setAutoRenew(
  db: Db,
  sendEmail: SendEmail,
  orgId: string,
  interval: BillingInterval | null,
  by: { name: string; email: string },
  opts: { now?: Date; appUrl?: string } = {},
): Promise<RenewalChangeResult> {
  const now = opts.now ?? new Date();
  const appUrl = opts.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  type Changed = { error: string } | { unchanged: true } | { org: Organization };
  const changed = await db.transaction(async (tx): Promise<Changed> => {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId)).for("update");
    const [card] = await tx.select().from(savedCards).where(eq(savedCards.orgId, orgId));
    if (!org) return { error: "Organisation not found." };
    if (interval && !card) return { error: "There's no saved card. Pay by card and tick “Save my card” to set one up." };
    if (interval && card && !willAutoRenew({ autoRenewInterval: interval }, card, accessFor(org, now).endsAt)) {
      return { error: `The ${cardLabel(card)} expires before your current period ends. Pay with another card to save it.` };
    }
    if (org.autoRenewInterval === interval) return { unchanged: true };
    if (interval) {
      // Once the period has ended, only a charge still to come can renew it. After
      // the last attempt, or too long after the end, none will.
      const { endsAt } = accessFor(org, now);
      if (endsAt <= now) {
        const [made] = await tx
          .select({ last: sql<number | null>`max(${renewalAttempts.attempt})` })
          .from(renewalAttempts)
          .where(and(eq(renewalAttempts.orgId, orgId), eq(renewalAttempts.endsAt, endsAt)));
        if (!dueRenewalAttempt(endsAt, now) || (made?.last ?? 0) >= RENEWAL_ATTEMPTS) {
          return { error: "This period can't be renewed automatically any more. Pay now, and renewal will continue from the next period." };
        }
      }
    }
    await tx.update(organizations).set({ autoRenewInterval: interval }).where(eq(organizations.id, orgId));
    return { org };
  });
  if ("error" in changed) return { error: changed.error };
  if ("unchanged" in changed || interval) return { ok: true };
  await notifyRenewalStopped(db, sendEmail, changed.org, `${by.name} (${by.email}) turned automatic renewal off.`, now, appUrl);
  return { ok: true };
}

/**
 * Forgets the saved card: here, and on Paystack so it can't be charged with
 * our key. Renewal goes off with it.
 */
export async function removeSavedCard(
  db: Db,
  paystack: Paystack | null,
  sendEmail: SendEmail,
  orgId: string,
  by: { name: string; email: string },
  opts: { now?: Date; appUrl?: string } = {},
): Promise<RenewalChangeResult> {
  const now = opts.now ?? new Date();
  const appUrl = opts.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  const removed = await db.transaction(async (tx) => {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId)).for("update");
    const [card] = await tx.delete(savedCards).where(eq(savedCards.orgId, orgId)).returning();
    if (!org || !card) return null;
    await tx.update(organizations).set({ autoRenewInterval: null }).where(eq(organizations.id, orgId));
    return { org, card };
  });
  if (!removed) return { error: "There's no saved card to remove." };
  if (paystack) {
    await paystack
      .deactivateAuthorization(removed.card.authorizationCode)
      .catch((err) => console.error("Failed to deactivate card on Paystack", orgId, err));
  }
  await notifyRenewalStopped(
    db,
    sendEmail,
    removed.org,
    `${by.name} (${by.email}) removed the saved ${cardLabel(removed.card)}${removed.org.autoRenewInterval ? ", which turns automatic renewal off" : ""}.`,
    now,
    appUrl,
  );
  return { ok: true };
}

async function notifyRenewalStopped(
  db: Db,
  sendEmail: SendEmail,
  org: { id: string; name: string; trialEndsAt: Date; paidUntil: Date | null },
  what: string,
  now: Date,
  appUrl: string,
): Promise<void> {
  const to = await ownerEmails(db, org.id);
  if (to.length === 0) return;
  const access = accessFor(org, now);
  const ends = formatDate(todayInKenya(access.endsAt));
  try {
    await sendEmail({
      to,
      subject: `${org.name}: Kinga won't renew automatically`,
      text: [
        "Hello,",
        "",
        what,
        "",
        access.state === "lapsed"
          ? "Kinga stays read-only until someone pays."
          : `${org.name}'s Kinga ${access.state === "trial" ? "free trial" : "subscription"} ends on ${ends} unless someone pays before then. We'll email a reminder 3 days before.`,
        "",
        "Billing, where you can pay or set up renewal again:",
        "",
        `${appUrl}/billing`,
      ].join("\n"),
    });
  } catch (err) {
    console.error("Failed to send renewal change email", org.id, err);
  }
}

/** The latest failed renewal charge for the period ending at `endsAt`, to show on the Billing page. */
export async function lastFailedRenewal(db: Db, orgId: string, endsAt: Date) {
  const [row] = await db
    .select({ attempt: renewalAttempts.attempt, error: renewalAttempts.error, at: renewalAttempts.createdAt })
    .from(renewalAttempts)
    .where(and(eq(renewalAttempts.orgId, orgId), eq(renewalAttempts.endsAt, endsAt), sql`${renewalAttempts.error} is not null`))
    .orderBy(desc(renewalAttempts.attempt))
    .limit(1);
  return row ?? null;
}
