// Signs users out, optionally forcing them through a password reset. Written
// for the 21 October 2026 Railway incident, where the production database
// password may have been read: sessions can't be forged from the stored
// hashes, but a stolen password can, so this is the "log everyone out" switch.
//
//   npm run sessions:revoke                                    # show what would happen
//   npm run sessions:revoke -- --all --yes
//   npm run sessions:revoke -- owner@example.com --yes
//   npm run sessions:revoke -- --all --force-password-reset --yes
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

// Not a valid scrypt hash, so verifyPassword() always fails. The user gets back
// in through "forgot password".
const UNUSABLE_PASSWORD_HASH = "!";

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const email = args.find((arg) => !arg.startsWith("--"));

const all = flags.has("--all");
const forceReset = flags.has("--force-password-reset");
const confirmed = flags.has("--yes");
const known = ["--all", "--force-password-reset", "--yes"];
const unknown = [...flags].filter((flag) => !known.includes(flag));

if (unknown.length > 0 || (all && email) || (!all && !email)) {
  console.error(
    "Usage: npm run sessions:revoke -- (--all | <email>) [--force-password-reset] [--yes]",
  );
  process.exit(2);
}

const targets = all
  ? await db.select({ id: users.id }).from(users)
  : await db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.email})`, email!.toLowerCase()));

if (targets.length === 0) {
  console.error(`No user with email ${email}.`);
  process.exit(1);
}
const ids = targets.map((target) => target.id);

const sessionsToRevoke = all
  ? await db.$count(sessions)
  : await db.$count(sessions, inArray(sessions.userId, ids));

console.log(
  `${all ? "All users" : email}: ${targets.length} user${targets.length === 1 ? "" : "s"}, ` +
    `${sessionsToRevoke} active session${sessionsToRevoke === 1 ? "" : "s"}.`,
);

if (!confirmed) {
  console.log(
    forceReset
      ? "Dry run. Add --yes to delete these sessions and force a password reset."
      : "Dry run. Add --yes to delete these sessions.",
  );
  process.exit(2);
}

await db.transaction(async (tx) => {
  if (all) {
    await tx.delete(sessions);
    if (forceReset) await tx.update(users).set({ passwordHash: UNUSABLE_PASSWORD_HASH });
  } else {
    await tx.delete(sessions).where(inArray(sessions.userId, ids));
    if (forceReset) {
      await tx.update(users).set({ passwordHash: UNUSABLE_PASSWORD_HASH }).where(inArray(users.id, ids));
    }
  }
});

console.log(`Signed out ${targets.length === 1 ? "the user" : `${targets.length} users`}.`);
if (forceReset) {
  console.log(
    "Forced a password reset. Check SMTP works before telling them: they'll need the \"forgot password\" email to get back in.",
  );
}
process.exit(0);
