import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { paymentOutcome, recordPayment, sendReceipt } from "@/lib/billing";
import { createEmailSender } from "@/lib/email";
import { paystackFromEnv } from "@/lib/paystack";
import { requireOrgContext } from "@/lib/session";

// Paystack sends the payer back here after checkout, with ?reference=. Look
// the transaction up rather than trusting the URL, and credit it if it
// succeeded. The webhook does the same, so whichever arrives first credits it.
export async function GET(request: Request) {
  const { org } = await requireOrgContext();
  const reference = new URL(request.url).searchParams.get("reference") ?? "";
  const paystack = paystackFromEnv();

  const [payment] = reference
    ? await db
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.reference, reference), eq(payments.orgId, org.id)))
        .limit(1)
    : [];
  if (!payment || !paystack) redirect("/billing");

  let outcome: string;
  try {
    const txn = await paystack.verify(reference);
    const recorded = await recordPayment(db, txn);
    if (recorded.result === "credited") await sendReceipt(db, createEmailSender(), recorded.paymentId);
    outcome = paymentOutcome(recorded.result, txn.status);
  } catch (err) {
    console.error("Failed to verify Paystack payment", reference, err);
    // The webhook will still credit it if it went through.
    outcome = "checking";
  }
  redirect(`/billing?payment=${outcome}`);
}
