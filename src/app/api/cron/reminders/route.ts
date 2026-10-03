import { timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { runBreachAlerts } from "@/lib/breach-alerts";
import { createEmailSender } from "@/lib/email";
import { runReminders } from "@/lib/reminders";

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
  const failed = reminders.failed.length + breaches.failed.length > 0;
  return Response.json({ reminders, breaches }, { status: failed ? 500 : 200 });
}
