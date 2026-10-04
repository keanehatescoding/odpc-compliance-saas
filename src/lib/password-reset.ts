import { and, eq, gt, lte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { passwordResetTokens, sessions, users } from "@/db/schema";
import type { EmailMessage } from "./email";
import { hashToken, newToken } from "./tokens";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Issues a reset link token for the user. Any earlier links they were sent stop working. */
export async function issueResetToken(db: Db, userId: string, now: Date = new Date()): Promise<string> {
  const token = newToken();
  await db.transaction(async (tx) => {
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    await tx.insert(passwordResetTokens).values({
      id: hashToken(token),
      userId,
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
    .where(and(eq(passwordResetTokens.id, hashToken(token)), gt(passwordResetTokens.expiresAt, now)))
    .limit(1);
  return Boolean(row);
}

/**
 * Uses up the token and sets the new password. Signs the user out everywhere,
 * since whoever knew the old password may still hold a session. Opening the
 * link proves they get mail at the address, so it also verifies it. Returns the
 * user's id, or null if the token was unknown, expired or already used.
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
      .returning({ userId: passwordResetTokens.userId });
    if (!used) return null;
    await tx
      .update(users)
      .set({ passwordHash, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, ${now.toISOString()}::timestamptz)` })
      .where(eq(users.id, used.userId));
    await tx.delete(sessions).where(eq(sessions.userId, used.userId));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, used.userId));
    return used.userId;
  });
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
