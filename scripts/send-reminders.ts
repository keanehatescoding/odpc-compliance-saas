// Run daily (e.g. from cron at 08:00 EAT): npm run reminders
import { db } from "@/db";
import { createEmailSender } from "@/lib/email";
import { runReminders } from "@/lib/reminders";

const result = await runReminders(db, createEmailSender());
console.log(
  `Checked ${result.checked} registrations; sent ${result.sent.length} reminders; ${result.failed.length} failed.`,
);
for (const f of result.failed) console.error(`  ${f.registrationId}: ${f.error}`);
process.exit(result.failed.length > 0 ? 1 : 0);
