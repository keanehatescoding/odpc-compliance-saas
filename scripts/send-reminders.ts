// Run hourly (breach deadlines are measured in hours): npm run reminders
import { db } from "@/db";
import { prunePayments, runBillingAlerts } from "@/lib/billing";
import { runBreachAlerts } from "@/lib/breach-alerts";
import { createEmailSender } from "@/lib/email";
import { pruneVerificationTokens } from "@/lib/email-verification";
import { pruneResetTokens } from "@/lib/password-reset";
import { pruneRateLimits } from "@/lib/rate-limit";
import { runReminders } from "@/lib/reminders";
import { runSubjectRequestAlerts } from "@/lib/subject-request-alerts";
import { pruneInvitations } from "@/lib/team";

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

const requests = await runSubjectRequestAlerts(db, send);
console.log(
  `Checked ${requests.checked} open data subject requests; sent ${requests.sent.length} alerts; ${requests.failed.length} failed.`,
);
for (const f of requests.failed) console.error(`  ${f.requestId}: ${f.error}`);

const billing = await runBillingAlerts(db, send);
console.log(
  `Checked ${billing.checked} organisations near the end of their trial or subscription; sent ${billing.sent.length} billing emails; ${billing.failed.length} failed.`,
);
for (const f of billing.failed) console.error(`  ${f.orgId}: ${f.error}`);

// Housekeeping: drop stale login counters, expired reset, verification and invitation links, and unpaid checkouts.
await pruneRateLimits(db);
await pruneResetTokens(db);
await pruneVerificationTokens(db);
await pruneInvitations(db);
await prunePayments(db);

process.exit(result.failed.length + breaches.failed.length + requests.failed.length + billing.failed.length > 0 ? 1 : 0);
