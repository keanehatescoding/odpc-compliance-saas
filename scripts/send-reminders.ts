// Run hourly (breach deadlines are measured in hours): npm run reminders
import { db } from "@/db";
import { runAutoRenewals } from "@/lib/auto-renew";
import { prunePayments, runBillingAlerts } from "@/lib/billing";
import { runBreachAlerts } from "@/lib/breach-alerts";
import { createEmailSender } from "@/lib/email";
import { pruneVerificationTokens } from "@/lib/email-verification";
import { etimsFromEnv } from "@/lib/etims";
import { runEtimsRetries } from "@/lib/etims-invoices";
import { runLegalNotices } from "@/lib/legal-notices";
import { pruneResetTokens } from "@/lib/password-reset";
import { paystackFromEnv } from "@/lib/paystack";
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

// Charge saved cards before the billing emails, so a renewal that goes through isn't followed by an "ended" email.
const paystack = paystackFromEnv();
const renewals = paystack ? await runAutoRenewals(db, paystack, send) : null;
if (renewals) {
  console.log(
    `Checked ${renewals.checked} organisations for automatic renewal; renewed ${renewals.renewed.length}, ${renewals.declined.length} declined, ${renewals.pending.length} pending; ${renewals.failed.length} failed.`,
  );
  for (const f of renewals.failed) console.error(`  ${f.orgId}: ${f.error}`);
}

const billing = await runBillingAlerts(db, send);
console.log(
  `Checked ${billing.checked} organisations near the end of their trial or subscription; sent ${billing.sent.length} billing emails; ${billing.failed.length} failed.`,
);
for (const f of billing.failed) console.error(`  ${f.orgId}: ${f.error}`);

// Send KRA any eTIMS invoices that didn't go through when their payment was credited.
const etimsClient = etimsFromEnv();
const etims = etimsClient ? await runEtimsRetries(db, etimsClient) : null;
if (etims) {
  console.log(
    `Sent ${etims.checked} pending eTIMS invoices; ${etims.signed.length} signed, ${etims.retrying.length} to retry, ${etims.failed.length} given up on.`,
  );
  for (const f of [...etims.retrying, ...etims.failed]) console.error(`  payment ${f.paymentId}: ${f.error}`);
}

const notices = await runLegalNotices(db, send);
if (notices.checked > 0) {
  console.log(`Checked ${notices.checked} legal notices not yet in effect; sent ${notices.sent.length}; ${notices.failed.length} failed.`);
}
for (const f of notices.failed) console.error(`  notice ${f.noticeId}, user ${f.userId}: ${f.error}`);

// Housekeeping: drop stale login counters, expired reset, verification and invitation links, and unpaid checkouts.
await pruneRateLimits(db);
await pruneResetTokens(db);
await pruneVerificationTokens(db);
await pruneInvitations(db);
await prunePayments(db);

process.exit(
  result.failed.length + breaches.failed.length + requests.failed.length + (renewals?.failed.length ?? 0) + billing.failed.length + (etims?.failed.length ?? 0) + notices.failed.length > 0
    ? 1
    : 0,
);
