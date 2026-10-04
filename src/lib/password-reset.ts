import { and, eq, gt, lte, ne, type SQL, type SQLWrapper, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { passwordResetTokens, sessions, users } from "@/db/schema";
import type { EmailMessage } from "./email";
import { hashToken, newToken } from "./tokens";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Issues a reset link token for the user, bound to the address it's being sent
 * to. Any earlier links they were sent stop working.
 */
export async function issueResetToken(
  db: Db,
  userId: string,
  email: string,
  now: Date = new Date(),
): Promise<string> {
  const token = newToken();
  await db.transaction(async (tx) => {
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    await tx.insert(passwordResetTokens).values({
      id: hashToken(token),
      userId,
      email,
      expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      createdAt: now,
    });
  });
  return token;
}

/** Whether a token is live, without using it up. For showing the reset form. */
export async function isResetTokenValid(db: Db, token: string, now: Date = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ id: passwordResetTokens.id })
    .from(passwordResetTokens)
    .innerJoin(users, and(eq(users.id, passwordResetTokens.userId), sameEmail(passwordResetTokens.email)))
    .where(and(eq(passwordResetTokens.id, hashToken(token)), gt(passwordResetTokens.expiresAt, now)))
    .limit(1);
  return Boolean(row);
}

/**
 * Uses up the token and sets the new password. Signs the user out everywhere,
 * since whoever knew the old password may still hold a session. Opening the
 * link proves they get mail at the address, so it also verifies it. Returns the
 * user's id, or null if the token was unknown, expired, already used, or sent
 * to an address the user has since changed.
 */
export async function resetPassword(
  db: Db,
  token: string,
  passwordHash: string,
  now: Date = new Date(),
): Promise<string | null> {
  return db.transaction(async (tx) => {
    // Deleting the row is what makes the token single-use: of two concurrent
    // submissions, only one gets it back.
    const [used] = await tx
      .delete(passwordResetTokens)
      .where(and(eq(passwordResetTokens.id, hashToken(token)), gt(passwordResetTokens.expiresAt, now)))
      .returning({ userId: passwordResetTokens.userId, email: passwordResetTokens.email });
    if (!used) return null;
    const [user] = await tx
      .update(users)
      .set({ passwordHash, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, ${now.toISOString()}::timestamptz)` })
      .where(and(eq(users.id, used.userId), sameEmail(used.email)))
      .returning({ id: users.id });
    if (!user) return null;
    await tx.delete(sessions).where(eq(sessions.userId, used.userId));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, used.userId));
    return used.userId;
  });
}

/**
 * Sets a signed-in user's new password. Signs out every other session, since
 * whoever knew the old password may hold one, but keeps the session making the
 * change. Outstanding reset links stop working too.
 */
export async function updatePassword(
  db: Db,
  userId: string,
  keepSessionId: string | null,
  passwordHash: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
    await tx
      .delete(sessions)
      .where(keepSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)) : eq(sessions.userId, userId));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  });
}

function sameEmail(email: SQLWrapper | string): SQL {
  return eq(sql`lower(${users.email})`, sql`lower(${email})`);
}

export async function pruneResetTokens(db: Db, now: Date = new Date()): Promise<void> {
  await db.delete(passwordResetTokens).where(lte(passwordResetTokens.expiresAt, now));
}

export function resetEmail(to: string, name: string, link: string): EmailMessage {
  return {
    to: [to],
    subject: "Reset your Kinga password",
    text: [
      `Hi ${name},`,
      "",
      "Someone asked to reset the password for your Kinga account. To choose a new password, open this link:",
      "",
      link,
      "",
      "The link works once and expires in 1 hour. Resetting your password signs you out on every device.",
      "",
      "If you didn't ask for this, you can ignore this email. Your password won't change.",
    ].join("\n"),
  };
}

export function passwordChangedEmail(to: string, name: string, forgotPasswordUrl: string): EmailMessage {
  return {
    to: [to],
    subject: "Your Kinga password was changed",
    text: [
      `Hi ${name},`,
      "",
      "The password for your Kinga account was just changed, and you've been signed out on every other device.",
      "",
      "If you didn't do this, reset your password straight away:",
      "",
      forgotPasswordUrl,
    ].join("\n"),
  };
}
