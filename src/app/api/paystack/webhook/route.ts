import { db } from "@/db";
import { afterPaymentCredited } from "@/lib/after-payment";
import { recordPayment } from "@/lib/billing";
import { createEmailSender } from "@/lib/email";
import { createPaystack, parseTransaction, verifyWebhookSignature } from "@/lib/paystack";
import { recordRefunds } from "@/lib/refunds";

// Set this URL as the webhook in the Paystack dashboard. Paystack retries
// deliveries that don't get a 200, so errors return 500 and are retried, and
// events we don't act on still get a 200.
export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return new Response("Payments not configured", { status: 503 });

  const body = await request.text();
  if (!verifyWebhookSignature(body, request.headers.get("x-paystack-signature"), secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: { event?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (event.event === "refund.processed" && event.data) {
    // A refund made in the Paystack dashboard: record it and send KRA its credit note.
    const result = await recordRefunds(db, createPaystack(secret), String(event.data.transaction_reference ?? ""));
    return Response.json({ result: result.result });
  }
  if (event.event !== "charge.success" || !event.data) return new Response(null, { status: 200 });

  const result = await recordPayment(db, parseTransaction(event.data));
  if (result.result === "credited") await afterPaymentCredited(db, createEmailSender(), result);
  // "unknown" covers charges that aren't Kinga payments, e.g. made from the Paystack dashboard.
  return Response.json({ result: result.result });
}
