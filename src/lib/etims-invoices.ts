import { and, asc, eq, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@/db";
import { etimsInvoices, payments, refunds, type EtimsInvoice, type Payment } from "@/db/schema";
import { formatReceiptNumber } from "./billing";
import { ETIMS_DUPLICATE, EtimsError, etimsItemCode, type Etims, type EtimsItem, type EtimsSale } from "./etims";
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
// Invoices. recordPayment creates a pending invoice when it credits a payment,
// and recordRefunds a pending credit note for each refund of an invoiced
// payment; each is sent straight after, and the hourly job retries any that
// didn't go. A credit note isn't sent until KRA has signed its sale.
// ---------------------------------------------------------------------------

export type IssueResult =
  | { result: "signed" }
  | { result: "retrying" | "failed"; error: string }
  /** Not pending, not due, waiting for its sale, or another attempt holds it. */
  | { result: "skipped" };

/** Our number for a credit note, sent to KRA as its trader invoice number. */
export function formatCreditNoteNumber(invcNo: number): string {
  return `CN-${String(invcNo).padStart(6, "0")}`;
}

const sale = alias(etimsInvoices, "sale");
const isSale = isNull(etimsInvoices.refundId);
/** A sale, or a credit note whose sale KRA has signed. */
const ready = or(
  isSale,
  sql`exists (select 1 from ${etimsInvoices} s where s.payment_id = ${etimsInvoices.paymentId} and s.refund_id is null and s.status = 'signed')`,
);

/**
 * Sends a payment's invoice to KRA for signing, if it's pending and due, and
 * stores the signature. Never throws: a failure is recorded on the invoice and
 * retried later with backoff, until ETIMS_MAX_ATTEMPTS. KRA answering that it
 * already has the invoice number (which happens when an earlier attempt went
 * through but its answer was lost) can't be retried, since KRA won't send the
 * signature again; it's marked failed for someone to look up on the eTIMS portal.
 */
export function issueEtimsInvoice(db: Db, etims: Etims, paymentId: string, now: Date = new Date()): Promise<IssueResult> {
  return issue(db, etims, and(eq(etimsInvoices.paymentId, paymentId), isSale)!, `payment ${paymentId}`, now);
}

/** Sends a refund's credit note to KRA, as issueEtimsInvoice does an invoice, once its sale is signed. */
export function issueEtimsCreditNote(db: Db, etims: Etims, refundId: string, now: Date = new Date()): Promise<IssueResult> {
  return issue(db, etims, eq(etimsInvoices.refundId, refundId), `refund ${refundId}`, now);
}

async function issue(db: Db, etims: Etims, which: SQL, what: string, now: Date): Promise<IssueResult> {
  let claimed: EtimsInvoice | undefined;
  try {
    [claimed] = await db
      .update(etimsInvoices)
      .set({ attempts: sql`${etimsInvoices.attempts} + 1`, nextAttemptAt: new Date(now.getTime() + ATTEMPT_LEASE_MS) })
      .where(and(which, eq(etimsInvoices.status, "pending"), lte(etimsInvoices.nextAttemptAt, now), ready))
      .returning();
  } catch (err) {
    // Nothing was claimed, so the invoice is still pending and due: the next run sends it.
    const error = err instanceof Error ? err.message : String(err);
    console.error(`eTIMS invoice for ${what} couldn't be claimed: ${error}`);
    return { result: "retrying", error };
  }
  if (!claimed) return { result: "skipped" };
  const stillPending = and(eq(etimsInvoices.id, claimed.id), eq(etimsInvoices.status, "pending"));
  const kind = claimed.refundId ? "credit note" : "invoice";

  try {
    const [payment] = await db.select().from(payments).where(eq(payments.id, claimed.paymentId));
    if (!payment?.paidAt || payment.receiptNumber === null) throw new Error("The payment hasn't been credited.");
    const base = {
      invcNo: claimed.invcNo,
      trdInvcNo: formatReceiptNumber(payment.receiptNumber),
      custTin: payment.billedKraPin,
      custNm: payment.billedName,
      channel: payment.channel,
      paidAt: payment.paidAt,
      item: etimsItemForPayment(payment, etims.config.itemClass),
      amount: payment.amount / 100,
    };
    let toSend: EtimsSale = base;
    if (claimed.refundId) {
      const [row] = await db
        .select({ refund: refunds, orgInvcNo: sale.invcNo })
        .from(refunds)
        .innerJoin(sale, and(eq(sale.paymentId, refunds.paymentId), isNull(sale.refundId)))
        .where(eq(refunds.id, claimed.refundId));
      if (!row) throw new Error("The refund or its sale's invoice is missing.");
      toSend = {
        ...base,
        trdInvcNo: formatCreditNoteNumber(claimed.invcNo),
        amount: row.refund.amount / 100,
        creditNote: { orgInvcNo: row.orgInvcNo, refundedAt: row.refund.refundedAt },
      };
    }
    const sig = await etims.saveSale(toSend);
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
    try {
      await db
        .update(etimsInvoices)
        .set(
          giveUp
            ? { status: "failed", lastError: error }
            : { lastError: error, nextAttemptAt: new Date(now.getTime() + etimsRetryDelay(claimed.attempts)) },
        )
        .where(stillPending);
    } catch (saveErr) {
      // Left as claimed: it's retried once the lease runs out.
      console.error(`eTIMS ${kind} ${claimed.invcNo}: couldn't record the failure:`, saveErr);
    }
    console.error(`eTIMS ${kind} ${claimed.invcNo} for ${what}: ${error}`);
    return { result: giveUp ? "failed" : "retrying", error };
  }
}

export interface EtimsRunResult {
  checked: number;
  /** Payments whose invoice or credit note was signed. */
  signed: string[];
  retrying: { paymentId: string; error: string }[];
  /** Given up on in this run. */
  failed: { paymentId: string; error: string }[];
}

/** Sends every pending invoice and credit note that's due, oldest first. Run hourly with the other jobs. */
export async function runEtimsRetries(db: Db, etims: Etims, opts: { now?: Date } = {}): Promise<EtimsRunResult> {
  const now = opts.now ?? new Date();
  const due = await db
    .select({ id: etimsInvoices.id, paymentId: etimsInvoices.paymentId })
    .from(etimsInvoices)
    .where(and(eq(etimsInvoices.status, "pending"), lte(etimsInvoices.nextAttemptAt, now), ready))
    .orderBy(asc(etimsInvoices.invcNo));
  const out: EtimsRunResult = { checked: due.length, signed: [], retrying: [], failed: [] };
  for (const { id, paymentId } of due) {
    const r = await issue(db, etims, eq(etimsInvoices.id, id), `payment ${paymentId}`, now);
    if (r.result === "signed") out.signed.push(paymentId);
    else if (r.result === "retrying") out.retrying.push({ paymentId, error: r.error });
    else if (r.result === "failed") out.failed.push({ paymentId, error: r.error });
  }
  return out;
}

/** A payment's invoice (not its credit notes). */
export async function etimsInvoiceFor(db: Db, paymentId: string): Promise<EtimsInvoice | null> {
  const [inv] = await db.select().from(etimsInvoices).where(and(eq(etimsInvoices.paymentId, paymentId), isSale));
  return inv ?? null;
}
