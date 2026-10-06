import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { etimsInvoices, payments, refunds, type EtimsInvoice, type Refund } from "@/db/schema";
import { etimsFromEnv, type Etims } from "./etims";
import { issueEtimsCreditNote } from "./etims-invoices";
import type { Paystack } from "./paystack";

export type RefundsResult =
  | { result: "recorded"; paymentId: string; refundIds: string[] }
  /** Not a credited Kinga payment, e.g. a charge made from the Paystack dashboard. */
  | { result: "unknown" };

/**
 * Records the refunds Paystack has processed on a payment, each once, and
 * sends KRA a credit note for each new one if the payment has an eTIMS
 * invoice. Looks the refunds up with Paystack rather than trusting the
 * webhook, whose refund event carries no refund ID. Runs for Paystack's
 * refund.processed webhook and for `npm run refunds`. Throws if Paystack or
 * the database fails, so the webhook is retried; credit notes are never
 * thrown from, and one that doesn't go is retried by the hourly job.
 */
export async function recordRefunds(
  db: Db,
  paystack: Paystack,
  reference: string,
  etims: Etims | null = etimsFromEnv(),
  now: Date = new Date(),
): Promise<RefundsResult> {
  const [payment] = await db.select().from(payments).where(eq(payments.reference, reference)).limit(1);
  if (!payment || payment.status !== "succeeded") return { result: "unknown" };
  const processed = (await paystack.refunds(reference)).filter((r) => r.status === "processed");

  const refundIds = await db.transaction(async (tx) => {
    // Lock the payment, so two deliveries of the same refund queue.
    await tx.select({ id: payments.id }).from(payments).where(eq(payments.id, payment.id)).for("update");
    const [invoice] = await tx
      .select({ id: etimsInvoices.id })
      .from(etimsInvoices)
      .where(and(eq(etimsInvoices.paymentId, payment.id), isNull(etimsInvoices.refundId)));
    const added: string[] = [];
    for (const r of processed) {
      if (r.currency.toUpperCase() !== payment.currency) {
        console.error(`Paystack refund ${r.id} of ${reference} is in ${r.currency}, not ${payment.currency}; not recorded.`);
        continue;
      }
      const [row] = await tx
        .insert(refunds)
        .values({ paymentId: payment.id, paystackId: r.id, amount: r.amount, currency: payment.currency, refundedAt: r.refundedAt ?? now })
        .onConflictDoNothing({ target: refunds.paystackId })
        .returning({ id: refunds.id });
      if (!row) continue;
      // Only an invoiced sale can be credited.
      if (invoice) await tx.insert(etimsInvoices).values({ paymentId: payment.id, refundId: row.id, nextAttemptAt: now });
      added.push(row.id);
    }
    return added;
  });

  if (etims) for (const id of refundIds) await issueEtimsCreditNote(db, etims, id, now);
  return { result: "recorded", paymentId: payment.id, refundIds };
}

/** A payment's refunds, oldest first, each with its credit note if it has one. */
export async function refundsFor(db: Db, paymentId: string): Promise<{ refund: Refund; creditNote: EtimsInvoice | null }[]> {
  return db
    .select({ refund: refunds, creditNote: etimsInvoices })
    .from(refunds)
    .leftJoin(etimsInvoices, eq(etimsInvoices.refundId, refunds.id))
    .where(eq(refunds.paymentId, paymentId))
    .orderBy(asc(refunds.refundedAt));
}
