import { and, asc, eq, lte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { etimsInvoices, payments, type EtimsInvoice, type Payment } from "@/db/schema";
import { formatReceiptNumber } from "./billing";
import { ETIMS_DUPLICATE, EtimsError, etimsItemCode, type Etims, type EtimsItem } from "./etims";
import { PLAN_PRICES, type BillingInterval } from "./plans";
import { SERVICES, SERVICE_KEYS, type ServiceKey } from "./services";

const MINUTE = 60_000;
/** Attempts before an invoice is given up on and left for someone to look at. */
export const ETIMS_MAX_ATTEMPTS = 10;
/** How long an attempt holds an invoice, so a second sender can't send it at the same time. */
const ATTEMPT_LEASE_MS = 10 * MINUTE;

/** Waits 5 minutes after the first failure, doubling each time, up to 12 hours. */
export function etimsRetryDelay(attempts: number): number {
  return Math.min(5 * MINUTE * 2 ** Math.max(attempts - 1, 0), 12 * 60 * MINUTE);
}

// ---------------------------------------------------------------------------
// Items. Each thing Kinga sells is registered with KRA once, under a fixed
// code, by `npm run etims:items`. The numbers must never be reused for
// something else.
// ---------------------------------------------------------------------------

type ItemKey = `plan_${BillingInterval}` | ServiceKey;

const ITEM_NUMBERS: Record<ItemKey, number> = {
  plan_month: 1,
  plan_year: 2,
  dpia_review: 3,
  compliance_audit: 4,
};

const lowest = (prices: Record<string, number>) => Math.min(...Object.values(prices));

function itemFor(key: ItemKey, itemClsCd: string | null): EtimsItem & { itemClsCd: string | null } {
  const itemCd = etimsItemCode(ITEM_NUMBERS[key]);
  if (key === "plan_month" || key === "plan_year") {
    const interval = key === "plan_month" ? "month" : "year";
    return {
      itemCd,
      itemClsCd: itemClsCd ?? "",
      itemNm: `Kinga subscription, ${interval === "year" ? "annual" : "monthly"} plan`,
      dftPrc: lowest(Object.fromEntries(Object.entries(PLAN_PRICES).map(([size, p]) => [size, p[interval]]))),
    };
  }
  return { itemCd, itemClsCd: itemClsCd ?? "", itemNm: `Kinga ${SERVICES[key].noun}`, dftPrc: lowest(SERVICES[key].prices) };
}

export function etimsItems(itemClsCd: string | null) {
  const keys: ItemKey[] = ["plan_month", "plan_year", ...SERVICE_KEYS];
  return keys.map((key) => ({ key, ...itemFor(key, itemClsCd) }));
}

/** The item a payment was for. */
export function etimsItemForPayment(p: Pick<Payment, "kind" | "interval" | "service">, itemClsCd: string | null) {
  const key: ItemKey = p.kind === "service" ? (p.service as ServiceKey) : `plan_${p.interval as BillingInterval}`;
  const item = itemFor(key, itemClsCd);
  return { itemCd: item.itemCd, itemClsCd: itemClsCd, itemNm: item.itemNm };
}

/** Registers every item with KRA. Safe to run again: items KRA already has are skipped. */
export async function registerEtimsItems(etims: Etims): Promise<{ itemCd: string; itemNm: string; added: boolean }[]> {
  if (!etims.config.itemClass) throw new Error("Set ETIMS_ITEM_CLASS first (find one with: npm run etims:items -- --classes <word>).");
  const done = [];
  for (const item of etimsItems(etims.config.itemClass)) {
    let added = true;
    try {
      await etims.saveItem(item);
    } catch (err) {
      if (!(err instanceof EtimsError && err.code === ETIMS_DUPLICATE)) throw err;
      added = false;
    }
    done.push({ itemCd: item.itemCd, itemNm: item.itemNm, added });
  }
  return done;
}

// ---------------------------------------------------------------------------
// Invoices. recordPayment creates a pending invoice when it credits a payment;
// it's sent straight after, and the hourly job retries any that didn't go.
// ---------------------------------------------------------------------------

export type IssueResult =
  | { result: "signed" }
  | { result: "retrying" | "failed"; error: string }
  /** Not pending, not due, or another attempt holds it. */
  | { result: "skipped" };

/**
 * Sends a payment's invoice to KRA for signing, if it's pending and due, and
 * stores the signature. Never throws: a failure is recorded on the invoice and
 * retried later with backoff, until ETIMS_MAX_ATTEMPTS. KRA answering that it
 * already has the invoice number (which happens when an earlier attempt went
 * through but its answer was lost) can't be retried, since KRA won't send the
 * signature again; it's marked failed for someone to look up on the eTIMS portal.
 */
export async function issueEtimsInvoice(db: Db, etims: Etims, paymentId: string, now: Date = new Date()): Promise<IssueResult> {
  const [claimed] = await db
    .update(etimsInvoices)
    .set({ attempts: sql`${etimsInvoices.attempts} + 1`, nextAttemptAt: new Date(now.getTime() + ATTEMPT_LEASE_MS) })
    .where(and(eq(etimsInvoices.paymentId, paymentId), eq(etimsInvoices.status, "pending"), lte(etimsInvoices.nextAttemptAt, now)))
    .returning();
  if (!claimed) return { result: "skipped" };
  const stillPending = and(eq(etimsInvoices.id, claimed.id), eq(etimsInvoices.status, "pending"));

  try {
    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
    if (!payment?.paidAt || payment.receiptNumber === null) throw new Error("The payment hasn't been credited.");
    const sig = await etims.saveSale({
      invcNo: claimed.invcNo,
      trdInvcNo: formatReceiptNumber(payment.receiptNumber),
      custTin: payment.billedKraPin,
      custNm: payment.billedName,
      channel: payment.channel,
      paidAt: payment.paidAt,
      item: etimsItemForPayment(payment, etims.config.itemClass),
      amount: payment.amount / 100,
    });
    await db
      .update(etimsInvoices)
      .set({
        status: "signed",
        lastError: null,
        tin: etims.config.tin,
        bhfId: etims.config.bhfId,
        sdcId: etims.config.sdcId,
        ...sig,
        signedAt: now,
      })
      .where(stillPending);
    return { result: "signed" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const duplicate = err instanceof EtimsError && err.code === ETIMS_DUPLICATE;
    const giveUp = duplicate || claimed.attempts >= ETIMS_MAX_ATTEMPTS;
    const error = duplicate
      ? `KRA already has invoice ${claimed.invcNo}, so an earlier attempt probably went through; look its signature up on the eTIMS portal. (${message})`
      : message;
    await db
      .update(etimsInvoices)
      .set(
        giveUp
          ? { status: "failed", lastError: error }
          : { lastError: error, nextAttemptAt: new Date(now.getTime() + etimsRetryDelay(claimed.attempts)) },
      )
      .where(stillPending);
    console.error(`eTIMS invoice ${claimed.invcNo} for payment ${paymentId}: ${error}`);
    return { result: giveUp ? "failed" : "retrying", error };
  }
}

export interface EtimsRunResult {
  checked: number;
  signed: string[];
  retrying: { paymentId: string; error: string }[];
  /** Given up on in this run. */
  failed: { paymentId: string; error: string }[];
}

/** Sends every pending invoice that's due, oldest first. Run hourly with the other jobs. */
export async function runEtimsRetries(db: Db, etims: Etims, opts: { now?: Date } = {}): Promise<EtimsRunResult> {
  const now = opts.now ?? new Date();
  const due = await db
    .select({ paymentId: etimsInvoices.paymentId })
    .from(etimsInvoices)
    .where(and(eq(etimsInvoices.status, "pending"), lte(etimsInvoices.nextAttemptAt, now)))
    .orderBy(asc(etimsInvoices.invcNo));
  const out: EtimsRunResult = { checked: due.length, signed: [], retrying: [], failed: [] };
  for (const { paymentId } of due) {
    const r = await issueEtimsInvoice(db, etims, paymentId, now);
    if (r.result === "signed") out.signed.push(paymentId);
    else if (r.result === "retrying") out.retrying.push({ paymentId, error: r.error });
    else if (r.result === "failed") out.failed.push({ paymentId, error: r.error });
  }
  return out;
}

export async function etimsInvoiceFor(db: Db, paymentId: string): Promise<EtimsInvoice | null> {
  const [inv] = await db.select().from(etimsInvoices).where(eq(etimsInvoices.paymentId, paymentId));
  return inv ?? null;
}
