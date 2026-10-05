import { randomUUID } from "node:crypto";
import { and, desc, eq, lt, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { billingAlertLog, organizations, payments, users, type Payment } from "@/db/schema";
import { formatDate, todayInKenya } from "./dates";
import { formatKsh, type OrgSize } from "./dpa";
import type { SendEmail } from "./email";
import { PaystackError, type Paystack, type PaystackTransaction } from "./paystack";
import { accessFor, addPeriod, PLAN_PRICES, toSubunits, type BillingInterval } from "./plans";
import { ownerEmails } from "./reminders";

const DAY = 86_400_000;
export const CURRENCY = "KES";
/** Pending checkouts nobody finished are dropped after this long. */
export const PENDING_PAYMENT_KEEP_MS = 30 * DAY;

/** Shown when payment is attempted but PAYSTACK_SECRET_KEY isn't set. */
export const PAYMENTS_UNAVAILABLE = "Online payment isn't set up yet. Contact us to pay by invoice.";

/**
 * Records a pending payment and starts a Paystack checkout for it. The amount
 * is fixed now from the organisation's size, so a later price or size change
 * can't alter what this checkout credits.
 */
export async function startCheckout(
  db: Db,
  paystack: Paystack,
  p: { orgId: string; userId: string; email: string; size: OrgSize; interval: BillingInterval; callbackUrl: string },
): Promise<{ url: string } | { error: string }> {
  // Paystack allows letters, digits, "-", "." and "=" in references.
  const reference = `kinga-${randomUUID().replaceAll("-", "")}`;
  const amount = toSubunits(PLAN_PRICES[p.size][p.interval]);
  await db
    .insert(payments)
    .values({ orgId: p.orgId, reference, interval: p.interval, amount, currency: CURRENCY, startedBy: p.userId });
  try {
    const { authorizationUrl } = await paystack.initialize({
      email: p.email,
      amount,
      currency: CURRENCY,
      reference,
      callbackUrl: p.callbackUrl,
      metadata: { orgId: p.orgId, interval: p.interval },
    });
    return { url: authorizationUrl };
  } catch (err) {
    console.error("Paystack checkout failed", err);
    await db.update(payments).set({ status: "failed" }).where(eq(payments.reference, reference));
    return { error: checkoutError(err) };
  }
}

function checkoutError(err: unknown): string {
  if (err instanceof PaystackError) {
    // A bad or missing key is ours to fix, not the payer's.
    if (err.status === 401 || err.status === 403) return PAYMENTS_UNAVAILABLE;
    if (err.status >= 400 && err.status < 500) {
      return `Our payment provider turned down this payment${err.reason ? ` (${err.reason})` : ""}. Contact us if this keeps happening.`;
    }
  }
  return "We couldn't reach our payment provider. Try again in a few minutes.";
}

export type RecordResult =
  | { result: "credited"; orgId: string; paymentId: string; periodEnd: Date }
  | { result: "already_credited"; orgId: string; periodEnd: Date | null }
  | { result: "not_paid" | "mismatch"; orgId: string }
  | { result: "unknown" };

/**
 * Credits a payment once Paystack reports it succeeded: marks it succeeded and
 * extends the organisation's paid period by its interval, from whichever is
 * latest of now, the end of the trial and the end of the current period (so
 * paying early never loses time). Runs for both the webhook and the return
 * from checkout, in either order, and credits each payment once.
 */
export async function recordPayment(db: Db, txn: PaystackTransaction, now: Date = new Date()): Promise<RecordResult> {
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.reference, txn.reference)).limit(1);
    if (!payment) return { result: "unknown" };
    const orgId = payment.orgId;
    if (txn.status !== "success") return { result: "not_paid", orgId };
    // Lock the organisation first (as billing alerts do), then the payment, so concurrent deliveries queue.
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId)).for("update");
    const [locked] = await tx.select().from(payments).where(eq(payments.id, payment.id)).for("update");
    if (!org || !locked) return { result: "unknown" };
    if (locked.status === "succeeded") return { result: "already_credited", orgId, periodEnd: locked.periodEnd };
    if (txn.amount !== locked.amount || txn.currency.toUpperCase() !== locked.currency) {
      console.error(
        `Paystack payment ${txn.reference} doesn't match: expected ${locked.amount} ${locked.currency}, got ${txn.amount} ${txn.currency}`,
      );
      return { result: "mismatch", orgId };
    }

    const start = [now, org.trialEndsAt, org.paidUntil].reduce<Date>(
      (latest, d) => (d && d > latest ? d : latest),
      now,
    );
    const periodEnd = addPeriod(start, locked.interval as BillingInterval);
    await tx
      .update(payments)
      .set({
        status: "succeeded",
        channel: txn.channel,
        paidAt: txn.paidAt ?? now,
        periodStart: start,
        periodEnd,
        receiptNumber: sql`nextval('receipt_number_seq')`,
        billedName: org.name,
        billedKraPin: org.kraPin,
      })
      .where(eq(payments.id, locked.id));
    await tx.update(organizations).set({ paidUntil: periodEnd }).where(eq(organizations.id, orgId));
    return { result: "credited", orgId, paymentId: locked.id, periodEnd };
  });
}

/** Paystack statuses after which a transaction can't succeed. Anything else unpaid may still go through. */
const FAILED_STATUSES = new Set(["failed", "reversed"]);

export type PaymentOutcome = "paid" | "unpaid" | "checking" | "problem";

/**
 * What to tell a payer returning from checkout. A transaction that isn't paid
 * yet may still be (an M-Pesa prompt not yet approved shows as pending or
 * abandoned until it is), and the webhook credits it when it is, so only a
 * final failure is reported as unpaid; otherwise saying so invites paying twice.
 */
export function paymentOutcome(result: RecordResult["result"], status: string): PaymentOutcome {
  if (result === "credited" || result === "already_credited") return "paid";
  if (result === "not_paid") return FAILED_STATUSES.has(status) ? "unpaid" : "checking";
  return "problem";
}

/** Succeeded payments, newest first. */
export async function paymentHistory(db: Db, orgId: string) {
  return db
    .select()
    .from(payments)
    .where(and(eq(payments.orgId, orgId), eq(payments.status, "succeeded")))
    .orderBy(desc(payments.paidAt));
}

/** A succeeded payment of this organisation, for its receipt. */
export async function getReceipt(db: Db, orgId: string, paymentId: string): Promise<Payment | null> {
  const [p] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.orgId, orgId), eq(payments.status, "succeeded")))
    .limit(1);
  return p ?? null;
}

// ---------------------------------------------------------------------------
// Receipts. Each credited payment gets the next receipt number, and the payer
// is emailed a link to its printable receipt.
// ---------------------------------------------------------------------------

/** Who the receipt is from. Set SELLER_* so receipts carry the business's legal details. */
export interface Seller {
  name: string;
  kraPin: string | null;
  address: string | null;
  email: string | null;
}

export function sellerFromEnv(env: NodeJS.ProcessEnv = process.env): Seller {
  return {
    name: env.SELLER_NAME || "Kinga",
    kraPin: env.SELLER_KRA_PIN || null,
    // "\n" in the variable starts a new line.
    address: env.SELLER_ADDRESS?.replaceAll("\\n", "\n") || null,
    email: env.SELLER_EMAIL || null,
  };
}

export function formatReceiptNumber(n: number): string {
  return `R-${String(n).padStart(6, "0")}`;
}

export function formatPaymentAmount(p: { amount: number; currency: string }): string {
  return p.currency === CURRENCY ? formatKsh(p.amount / 100) : `${p.currency} ${(p.amount / 100).toFixed(2)}`;
}

export function paymentMethod(channel: string | null): string {
  if (channel === "mobile_money") return "Mobile money";
  if (channel === "card") return "Card";
  return "Paystack";
}

/** What was paid for, e.g. "Kinga subscription, annual plan: 5 Oct 2026 to 5 Oct 2027". */
export function receiptDescription(p: Pick<Payment, "interval" | "periodStart" | "periodEnd">): string {
  const plan = `Kinga subscription, ${p.interval === "year" ? "annual" : "monthly"} plan`;
  if (!p.periodStart || !p.periodEnd) return plan;
  return `${plan}: ${formatDate(todayInKenya(p.periodStart))} to ${formatDate(todayInKenya(p.periodEnd))}`;
}

export function receiptEmail(to: string[], p: Payment, link: string) {
  const number = formatReceiptNumber(p.receiptNumber!);
  return {
    to,
    subject: `Kinga receipt ${number}: ${formatPaymentAmount(p)} received`,
    text: [
      "Hello,",
      "",
      `Thank you for your payment. Here are the details for ${p.billedName}'s records:`,
      "",
      `Receipt: ${number}`,
      `Paid: ${formatDate(todayInKenya(p.paidAt!))}`,
      `For: ${receiptDescription(p)}`,
      `Amount: ${formatPaymentAmount(p)} by ${paymentMethod(p.channel).toLowerCase()}`,
      `Reference: ${p.reference}`,
      "",
      "View or print the receipt here:",
      "",
      link,
    ].join("\n"),
  };
}

/**
 * Emails the receipt for a payment just credited to whoever paid, or to the
 * owners if that account has gone. Call it only after recordPayment returns
 * "credited", so each payment's receipt is sent once. A failed send is logged
 * rather than thrown: the receipt is always on the Billing page.
 */
export async function sendReceipt(
  db: Db,
  sendEmail: SendEmail,
  paymentId: string,
  appUrl: string = process.env.APP_URL ?? "http://localhost:3000",
): Promise<void> {
  try {
    const [row] = await db
      .select({ payment: payments, payerEmail: users.email, payerVerified: users.emailVerifiedAt })
      .from(payments)
      .leftJoin(users, eq(users.id, payments.startedBy))
      .where(eq(payments.id, paymentId))
      .limit(1);
    if (!row || row.payment.receiptNumber === null) return;
    const to = row.payerEmail && row.payerVerified ? [row.payerEmail] : await ownerEmails(db, row.payment.orgId);
    if (to.length === 0) return;
    await sendEmail(receiptEmail(to, row.payment, `${appUrl}/billing/receipts/${row.payment.id}`));
  } catch (err) {
    console.error("Failed to send receipt", paymentId, err);
  }
}

/** Drops checkouts that were never paid. */
export async function prunePayments(db: Db, now: Date = new Date()): Promise<void> {
  await db
    .delete(payments)
    .where(and(ne(payments.status, "succeeded"), lt(payments.createdAt, new Date(now.getTime() - PENDING_PAYMENT_KEEP_MS))));
}

// ---------------------------------------------------------------------------
// Billing emails: a reminder shortly before access ends, and a notice once it
// has. Sent to owners, since they decide whether to pay.
// ---------------------------------------------------------------------------

export const ENDING_SOON_DAYS = 3;
/** After downtime, don't tell an organisation that lapsed long ago. */
export const ENDED_NOTICE_DAYS = 14;

export type BillingAlertKind = "ending_soon" | "ended";

export function dueBillingAlert(org: { trialEndsAt: Date; paidUntil: Date | null }, now: Date): BillingAlertKind | null {
  const { state, endsAt } = accessFor(org, now);
  const ms = endsAt.getTime() - now.getTime();
  if (state !== "lapsed") return ms <= ENDING_SOON_DAYS * DAY ? "ending_soon" : null;
  return -ms <= ENDED_NOTICE_DAYS * DAY ? "ended" : null;
}

export interface BillingAlertRunResult {
  checked: number;
  sent: { orgId: string; kind: BillingAlertKind; to: string[] }[];
  failed: { orgId: string; error: string }[];
}

/**
 * Emails owners when their trial or paid period is about to end or has ended.
 * Each (organisation, kind, end date) is claimed in billing_alert_log before
 * sending, so it's safe to run often, and paying (which moves the end date)
 * starts a fresh set.
 */
export async function runBillingAlerts(
  db: Db,
  sendEmail: SendEmail,
  opts: { now?: Date; appUrl?: string } = {},
): Promise<BillingAlertRunResult> {
  const now = opts.now ?? new Date();
  const appUrl = opts.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  const result: BillingAlertRunResult = { checked: 0, sent: [], failed: [] };

  const endsAt = sql`greatest(${organizations.trialEndsAt}, coalesce(${organizations.paidUntil}, ${organizations.trialEndsAt}))`;
  const candidates = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      sql`${endsAt} between ${new Date(now.getTime() - ENDED_NOTICE_DAYS * DAY).toISOString()}::timestamptz
        and ${new Date(now.getTime() + ENDING_SOON_DAYS * DAY).toISOString()}::timestamptz`,
    );

  for (const { id } of candidates) {
    result.checked++;
    const to = await ownerEmails(db, id);
    if (to.length === 0) continue;

    // Lock the organisation (as crediting a payment does) and decide under the
    // lock, so a payment that lands meanwhile can't be followed by a stale "ending" email.
    const claim = await db.transaction(async (tx) => {
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, id)).for("update");
      if (!org) return null;
      const kind = dueBillingAlert(org, now);
      if (!kind) return null;
      const access = accessFor(org, now);
      const [claimed] = await tx
        .insert(billingAlertLog)
        .values({ orgId: org.id, kind, endsAt: access.endsAt, recipients: to })
        .onConflictDoNothing()
        .returning({ id: billingAlertLog.id });
      return claimed ? { id: claimed.id, org, kind, access } : null;
    });
    if (!claim) continue;

    try {
      await sendEmail(billingEmail(to, claim.org, claim.kind, claim.access.endsAt, claim.org.paidUntil !== null, `${appUrl}/billing`));
      result.sent.push({ orgId: id, kind: claim.kind, to });
    } catch (err) {
      result.failed.push({ orgId: id, error: err instanceof Error ? err.message : String(err) });
      await db
        .delete(billingAlertLog)
        .where(eq(billingAlertLog.id, claim.id))
        .catch((releaseErr) => console.error("Failed to release billing alert claim", releaseErr));
    }
  }
  return result;
}

export function billingEmail(
  to: string[],
  org: { name: string; size: string },
  kind: BillingAlertKind,
  endsAt: Date,
  hasPaid: boolean,
  link: string,
) {
  const what = hasPaid ? "subscription" : "free trial";
  const on = formatDate(todayInKenya(endsAt));
  const prices = PLAN_PRICES[org.size as OrgSize];
  const priceLine = `Your plan costs ${formatKsh(prices.month)} a month, or ${formatKsh(prices.year)} a year (two months free). Pay by M-Pesa or card.`;
  const stillWorks =
    "You can still see and export all your records and log and manage data breaches, and renewal reminders and deadline alerts keep coming.";
  if (kind === "ending_soon") {
    return {
      to,
      subject: `${org.name}: your Kinga ${what} ends on ${on}`,
      text: [
        "Hello,",
        "",
        `${org.name}'s Kinga ${what} ends on ${on}. To keep editing your records after that, pay here:`,
        "",
        link,
        "",
        priceLine,
        "",
        `If it ends, Kinga becomes read-only until you pay. ${stillWorks}`,
      ].join("\n"),
    };
  }
  return {
    to,
    subject: `${org.name}: your Kinga ${what} has ended`,
    text: [
      "Hello,",
      "",
      `${org.name}'s Kinga ${what} ended on ${on}, so Kinga is read-only until you pay. To keep editing your records, pay here:`,
      "",
      link,
      "",
      priceLine,
      "",
      stillWorks,
    ].join("\n"),
  };
}
