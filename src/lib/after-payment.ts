import type { Db } from "@/db";
import { sendReceipt, type RecordResult } from "./billing";
import type { SendEmail } from "./email";
import { sendServiceOrderNotice } from "./service-orders";

/**
 * What follows crediting a payment: the payer's receipt and, for a service,
 * the order notice to Kinga. Call it only with a "credited" result, so each
 * runs once per payment. Failures are logged, never thrown.
 */
export async function afterPaymentCredited(
  db: Db,
  sendEmail: SendEmail,
  credited: Extract<RecordResult, { result: "credited" }>,
): Promise<void> {
  await sendReceipt(db, sendEmail, credited.paymentId);
  if (credited.kind === "service") await sendServiceOrderNotice(db, sendEmail, credited.paymentId);
}
