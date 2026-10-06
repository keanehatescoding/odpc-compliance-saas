import { timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { runAutoRenewals } from "@/lib/auto-renew";
import { prunePayments, runBillingAlerts } from "@/lib/billing";
import { runBreachAlerts } from "@/lib/breach-alerts";
import { createEmailSender } from "@/lib/email";
import { pruneVerificationTokens } from "@/lib/email-verification";
import { etimsFromEnv } from "@/lib/etims";
import { runEtimsRetries } from "@/lib/etims-invoices";
import { pruneResetTokens } from "@/lib/password-reset";
import { paystackFromEnv } from "@/lib/paystack";
import { pruneRateLimits } from "@/lib/rate-limit";
import { runReminders } from "@/lib/reminders";
import { runSubjectRequestAlerts } from "@/lib/subject-request-alerts";
import { pruneInvitations } from "@/lib/team";

// For schedulers that call a URL (Vercel Cron, GitHub Actions, cron-job.org).
// Send `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok =
    Boolean(secret) &&
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return new Response("Unauthorized", { status: 401 });

  const send = createEmailSender();
  const reminders = await runReminders(db, send);
  const breaches = await runBreachAlerts(db, send);
  const requests = await runSubjectRequestAlerts(db, send);
  // Charge saved cards before the billing emails, so a renewal that goes through isn't followed by an "ended" email.
  const paystack = paystackFromEnv();
  const renewals = paystack ? await runAutoRenewals(db, paystack, send) : null;
  const billing = await runBillingAlerts(db, send);
  // Send KRA any eTIMS invoices that didn't go through when their payment was credited.
  const etimsClient = etimsFromEnv();
  const etims = etimsClient ? await runEtimsRetries(db, etimsClient) : null;
  // Housekeeping: drop stale login counters, expired reset, verification and invitation links, and unpaid checkouts.
  await pruneRateLimits(db);
  await pruneResetTokens(db);
  await pruneVerificationTokens(db);
  await pruneInvitations(db);
  await prunePayments(db);
  const failed =
    reminders.failed.length + breaches.failed.length + requests.failed.length + (renewals?.failed.length ?? 0) + billing.failed.length + (etims?.failed.length ?? 0) > 0;
  return Response.json({ reminders, breaches, requests, renewals, billing, etims }, { status: failed ? 500 : 200 });
}
