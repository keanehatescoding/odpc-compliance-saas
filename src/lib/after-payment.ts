import type { Db } from "@/db";
import { sendReceipt, type RecordResult } from "./billing";
import type { SendEmail } from "./email";
import { etimsFromEnv, type Etims } from "./etims";
import { issueEtimsInvoice } from "./etims-invoices";
import { sendServiceOrderNotice } from "./service-orders";

/**
 * What follows crediting a payment: its KRA eTIMS invoice (if eTIMS is set
 * up), then the payer's receipt, which shows the invoice if KRA signed it in
 * time, and, for a service, the order notice to Kinga. Call it only with a
 * "credited" result, so each runs once per payment. Failures are logged, never
 * thrown; an unsigned invoice is retried by the hourly job.
 */
export async function afterPaymentCredited(
  db: Db,
  sendEmail: SendEmail,
  credited: Extract<RecordResult, { result: "credited" }>,
  etims: Etims | null = etimsFromEnv(),
): Promise<void> {
  if (etims) await issueEtimsInvoice(db, etims, credited.paymentId);
  await sendReceipt(db, sendEmail, credited.paymentId);
  if (credited.kind === "service") await sendServiceOrderNotice(db, sendEmail, credited.paymentId);
}
