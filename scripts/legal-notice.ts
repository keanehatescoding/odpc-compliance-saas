// Emails owners about a change to the Terms, DPA, Privacy Notice, sub-processors or prices:
//   npm run legal-notice                                         lists notices not yet in effect
//   npm run legal-notice -- <YYYY-MM-DD> <summary-file>          previews the email and who gets it
//   npm run legal-notice -- <YYYY-MM-DD> <summary-file> --send   saves the notice and sends it
// The hourly job sends it to anyone who becomes an owner before the date.
import { readFileSync } from "node:fs";
import { db } from "@/db";
import { sellerFromEnv } from "@/lib/billing";
import { formatDate } from "@/lib/dates";
import { createEmailSender } from "@/lib/email";
import {
  createLegalNotice,
  legalNoticeEmail,
  legalNoticeError,
  legalNoticeRecipients,
  pendingLegalNotices,
  runLegalNotices,
} from "@/lib/legal-notices";

const args = process.argv.slice(2);
const send = args.includes("--send");
const [effectiveOn, summaryFile] = args.filter((a) => a !== "--send");

if (!effectiveOn) {
  const pending = await pendingLegalNotices(db);
  if (pending.length === 0) console.log("No notices waiting to take effect.");
  for (const { notice, sent } of pending) {
    console.log(`${formatDate(notice.effectiveOn)}  sent to ${sent} owner${sent === 1 ? "" : "s"}  ${notice.id}`);
    console.log(`  ${notice.summary.split("\n").join("\n  ")}`);
  }
  process.exit(0);
}

if (!summaryFile) {
  console.error("Usage: npm run legal-notice -- <YYYY-MM-DD> <summary-file> [--send]");
  process.exit(2);
}

const summary = readFileSync(summaryFile, "utf8").trim();
const error = legalNoticeError(effectiveOn, summary);
if (error) {
  console.error(error);
  process.exit(2);
}

if (!send) {
  const recipients = await legalNoticeRecipients(db, null);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const email = legalNoticeEmail("owner@example.com", recipients[0]?.orgName ?? "Your organisation", { effectiveOn, summary }, appUrl, sellerFromEnv());
  console.log(`Subject: ${email.subject}\n\n${email.text}\n`);
  console.log(`This would go to ${recipients.length} owner${recipients.length === 1 ? "" : "s"}. Add --send to send it.`);
  process.exit(0);
}

const created = await createLegalNotice(db, effectiveOn, summary);
if ("error" in created) {
  console.error(created.error);
  process.exit(2);
}
const result = await runLegalNotices(db, createEmailSender());
const mine = (r: { noticeId: string }) => r.noticeId === created.notice.id;
const emailed = result.sent.filter(mine).length;
console.log(`Notice ${created.notice.id} saved. Emailed ${emailed} owner${emailed === 1 ? "" : "s"}.`);
const failed = result.failed.filter(mine);
for (const f of failed) console.error(`  couldn't email user ${f.userId}: ${f.error}`);
if (failed.length > 0) console.error("The hourly job will try them again.");
process.exit(failed.length > 0 ? 1 : 0);
