// Records the refunds Paystack has made on a payment and sends KRA their
// eTIMS credit notes, for when the refund.processed webhook didn't arrive:
//   npm run refunds -- R-000123
//   npm run refunds -- <Paystack reference>
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { formatPaymentAmount, formatReceiptNumber } from "@/lib/billing";
import { formatDate, todayInKenya } from "@/lib/dates";
import { formatCuInvoiceNumber } from "@/lib/etims";
import { formatCreditNoteNumber } from "@/lib/etims-invoices";
import { paystackFromEnv } from "@/lib/paystack";
import { recordRefunds, refundsFor } from "@/lib/refunds";

const [arg] = process.argv.slice(2);
if (!arg) {
  console.error("Usage: npm run refunds -- <receipt number, e.g. R-000123, or Paystack reference>");
  process.exit(2);
}
const paystack = paystackFromEnv();
if (!paystack) {
  console.error("Set PAYSTACK_SECRET_KEY first.");
  process.exit(2);
}

const receipt = /^R-?(\d+)$/i.exec(arg);
const [payment] = await db
  .select()
  .from(payments)
  .where(receipt ? eq(payments.receiptNumber, Number(receipt[1])) : eq(payments.reference, arg))
  .limit(1);
const result = payment ? await recordRefunds(db, paystack, payment.reference) : { result: "unknown" as const };
if (!payment || result.result === "unknown") {
  console.error(`No paid payment ${arg}.`);
  process.exit(1);
}

console.log(`${formatReceiptNumber(payment.receiptNumber!)} (${payment.reference}): ${formatPaymentAmount(payment)} paid by ${payment.billedName}.`);
const all = await refundsFor(db, payment.id);
if (all.length === 0) console.log("Paystack has processed no refunds on it.");
let unsigned = 0;
for (const { refund, creditNote } of all) {
  const note = !creditNote
    ? "no credit note (the payment has no eTIMS invoice)"
    : creditNote.status === "signed"
      ? `credit note ${formatCreditNoteNumber(creditNote.invcNo)} signed as ${formatCuInvoiceNumber(creditNote)}`
      : `credit note ${formatCreditNoteNumber(creditNote.invcNo)} ${creditNote.status}${creditNote.lastError ? `: ${creditNote.lastError}` : " (sent once the payment's invoice is signed)"}`;
  if (creditNote && creditNote.status !== "signed") unsigned++;
  const isNew = result.refundIds.includes(refund.id) ? " [new]" : "";
  console.log(`  ${formatDate(todayInKenya(refund.refundedAt))}  ${formatPaymentAmount(refund)} refunded${isNew}; ${note}`);
}
process.exit(unsigned > 0 ? 1 : 0);
