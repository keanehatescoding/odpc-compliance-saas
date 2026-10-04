import { and, eq, gt, lte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { emailVerificationTokens, users } from "@/db/schema";
import type { EmailMessage } from "./email";
import { hashToken, newToken } from "./tokens";

export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Issues a verification link token for the user's current address. Earlier links stop working. */
export async function issueVerificationToken(
  db: Db,
  userId: string,
  email: string,
  now: Date = new Date(),
): Promise<string> {
  const token = newToken();
  await db.transaction(async (tx) => {
    await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));
    await tx.insert(emailVerificationTokens).values({
      id: hashToken(token),
      userId,
      email,
      expiresAt: new Date(now.getTime() + VERIFY_TOKEN_TTL_MS),
      createdAt: now,
    });
  });
  return token;
}

/**
 * Uses up the token and marks the user's email verified. Returns the user's
 * id, or null if the token was unknown, expired, already used, or sent to an
 * address the user has since changed.
 */
export async function verifyEmail(db: Db, token: string, now: Date = new Date()): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [used] = await tx
      .delete(emailVerificationTokens)
      .where(and(eq(emailVerificationTokens.id, hashToken(token)), gt(emailVerificationTokens.expiresAt, now)))
      .returning({ userId: emailVerificationTokens.userId, email: emailVerificationTokens.email });
    if (!used) return null;
    const [user] = await tx
      .update(users)
      .set({ emailVerifiedAt: now })
      .where(and(eq(users.id, used.userId), eq(sql`lower(${users.email})`, used.email.toLowerCase())))
      .returning({ id: users.id });
    if (!user) return null;
    await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));
    return user.id;
  });
}

export async function pruneVerificationTokens(db: Db, now: Date = new Date()): Promise<void> {
  await db.delete(emailVerificationTokens).where(lte(emailVerificationTokens.expiresAt, now));
}

export function verificationEmail(to: string, name: string, link: string): EmailMessage {
  return {
    to: [to],
    subject: "Confirm your email for Kinga",
    text: [
      `Hi ${name},`,
      "",
      "To finish setting up your Kinga account, confirm your email address by opening this link:",
      "",
      link,
      "",
      "The link expires in 24 hours. Kinga sends ODPC renewal reminders and breach deadline alerts to this address, so it needs to reach you.",
      "",
      "If you didn't create a Kinga account, you can ignore this email.",
    ].join("\n"),
  };
}
