// Run hourly (breach deadlines are measured in hours): npm run reminders
import { db } from "@/db";
import { runBreachAlerts } from "@/lib/breach-alerts";
import { createEmailSender } from "@/lib/email";
import { runReminders } from "@/lib/reminders";

const send = createEmailSender();
const result = await runReminders(db, send);
console.log(
  `Checked ${result.checked} registrations; sent ${result.sent.length} reminders; ${result.failed.length} failed.`,
);
for (const f of result.failed) console.error(`  ${f.registrationId}: ${f.error}`);

const breaches = await runBreachAlerts(db, send);
console.log(
  `Checked ${breaches.checked} open breaches; sent ${breaches.sent.length} alerts; ${breaches.failed.length} failed.`,
);
for (const f of breaches.failed) console.error(`  ${f.breachId}: ${f.error}`);

process.exit(result.failed.length + breaches.failed.length > 0 ? 1 : 0);
