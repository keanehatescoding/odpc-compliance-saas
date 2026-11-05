// Forgets every saved card, here and on Paystack, so a leaked database
// password or payment key can't be used to charge one. Written for the 21
// October 2026 Railway incident (docs/railway-incident-2026-10-21.md), where
// the authorisation codes in `saved_cards` may have been read: rotating
// PAYSTACK_SECRET_KEY does not stop a code being charged with the new one.
//
//   npm run cards:deauthorize                              # show what would happen
//   npm run cards:deauthorize -- --yes
//   npm run cards:deauthorize -- --yes --force             # forget ours even if Paystack refuses
//   npm run cards:deauthorize -- --yes --reason "a security incident at our hosting provider"
//
// Automatic renewal goes off with the cards, and the owners are emailed that
// their next payment is theirs to make, so check SMTP is working first.
//
// Safe to run again: it picks up whatever cards are still saved, and a card
// Paystack refused is left for the next run. Safe to run while the reminders
// scheduler is going, too: renewal is turned off under each organisation's
// lock before its card is touched, so a charge in flight finishes and no new
// one starts.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, savedCards } from "@/db/schema";
import { deauthorizeSavedCards } from "@/lib/auto-renew";
import { createEmailSender } from "@/lib/email";
import { paystackFromEnv } from "@/lib/paystack";
import { cardLabel } from "@/lib/plans";

const DEFAULT_REASON = "a security incident at our hosting provider";

const args = process.argv.slice(2);
const flags = args.filter((arg) => arg.startsWith("--"));
const known = ["--yes", "--force", "--reason"];
const unknown = flags.filter((flag) => !known.includes(flag));
const reasonAt = args.indexOf("--reason");
// A flag where the reason should be means the reason was left out, not that
// owners should be told their card went "after --yes".
const given = args[reasonAt + 1] ?? "";
const reason = reasonAt === -1 ? DEFAULT_REASON : given.startsWith("--") ? "" : given;
const stray = args.filter((arg, i) => !arg.startsWith("--") && !(reasonAt !== -1 && i === reasonAt + 1));

if (unknown.length > 0 || stray.length > 0 || !reason.trim()) {
  console.error('Usage: npm run cards:deauthorize -- [--yes] [--force] [--reason "why"]');
  process.exit(2);
}

const paystack = paystackFromEnv();
if (!paystack) {
  console.error("Set PAYSTACK_SECRET_KEY first — the new key, if you have rotated it.");
  process.exit(2);
}

const cards = await db
  .select({ card: savedCards, orgName: organizations.name, renewal: organizations.autoRenewInterval })
  .from(savedCards)
  .innerJoin(organizations, eq(organizations.id, savedCards.orgId))
  .orderBy(savedCards.createdAt);

if (cards.length === 0) {
  console.log("No saved cards.");
  process.exit(0);
}

console.log(`${cards.length} saved card${cards.length === 1 ? "" : "s"}:`);
for (const { card, orgName, renewal } of cards) {
  console.log(`  ${orgName}: ${cardLabel(card)}${renewal ? `, renewing ${renewal === "year" ? "annually" : "monthly"}` : ""}`);
}

if (!args.includes("--yes")) {
  console.log(
    "\nDry run. Add --yes to deactivate these cards on Paystack, forget them here, turn automatic " +
      "renewal off and email the owners concerned.",
  );
  process.exit(2);
}

const result = await deauthorizeSavedCards(db, paystack, createEmailSender(), {
  reason: reason.trim(),
  force: args.includes("--force"),
});

console.log(`\nForgot ${result.removed.length} card${result.removed.length === 1 ? "" : "s"}.`);
for (const { orgName, card } of result.removed) console.log(`  ${orgName}: ${card}`);
if (result.failed.length > 0) {
  console.error(`\nStill saved, ${result.failed.length}:`);
  for (const { orgName, card, error } of result.failed) console.error(`  ${orgName}: ${card} — ${error}`);
  console.error(
    "\nAutomatic renewal is off for these in Kinga, except any that say it couldn't be turned off,\n" +
      "but Paystack may still accept charges on all of them. Run this again, or, for a card Paystack\n" +
      "won't deactivate, deactivate it in the Paystack dashboard and run this with --force.",
  );
}
if (result.unnotified.length > 0) {
  console.error(`\nForgotten, but the owners weren't emailed, ${result.unnotified.length}:`);
  for (const { orgName, card, error } of result.unnotified) console.error(`  ${orgName}: ${card} — ${error}`);
  console.error(
    "\nRunning this again won't email them, as the cards are gone. Tell these owners yourself that\n" +
      "automatic renewal has stopped and their next payment is theirs to make.",
  );
}
process.exit(result.failed.length > 0 || result.unnotified.length > 0 ? 1 : 0);
