import { timingSafeEqual } from "node:crypto";
import { db } from "@/db";
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

  const result = await runReminders(db, createEmailSender());
  return Response.json(result, { status: result.failed.length > 0 ? 500 : 200 });
}
