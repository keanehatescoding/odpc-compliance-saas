import { timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { runBreachAlerts } from "@/lib/breach-alerts";
import { createEmailSender } from "@/lib/email";
import { pruneVerificationTokens } from "@/lib/email-verification";
import { pruneResetTokens } from "@/lib/password-reset";
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
  // Housekeeping: drop stale login counters and expired reset, verification and invitation links.
  await pruneRateLimits(db);
  await pruneResetTokens(db);
  await pruneVerificationTokens(db);
  await pruneInvitations(db);
  const failed = reminders.failed.length + breaches.failed.length + requests.failed.length > 0;
  return Response.json({ reminders, breaches, requests }, { status: failed ? 500 : 200 });
}
