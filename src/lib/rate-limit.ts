import { eq, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { rateLimits } from "@/db/schema";

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

const MINUTE = 60_000;

export const RATE_LIMITS = {
  loginIp: { limit: 30, windowMs: 15 * MINUTE },
  loginEmail: { limit: 10, windowMs: 15 * MINUTE },
  signupIp: { limit: 10, windowMs: 60 * MINUTE },
  resetRequestIp: { limit: 10, windowMs: 60 * MINUTE },
  resetRequestEmail: { limit: 3, windowMs: 60 * MINUTE },
  resetSubmitIp: { limit: 20, windowMs: 60 * MINUTE },
  verifySendUser: { limit: 5, windowMs: 60 * MINUTE },
  passwordChangeUser: { limit: 10, windowMs: 15 * MINUTE },
  inviteSendUser: { limit: 20, windowMs: 60 * MINUTE },
  checkoutUser: { limit: 10, windowMs: 60 * MINUTE },
} satisfies Record<string, RateLimitRule>;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterMs: number };

/**
 * Counts one attempt against `key` and says whether it is within the limit.
 * Fixed windows, stored in Postgres so every app instance shares the count.
 * The upsert is a single statement, so concurrent attempts can't both slip
 * under the limit.
 */
export async function hitRateLimit(
  db: Db,
  key: string,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const nowTs = sql`${now.toISOString()}::timestamptz`;
  const expired = sql`${rateLimits.windowStart} <= ${new Date(now.getTime() - rule.windowMs).toISOString()}::timestamptz`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${expired} then ${nowTs} else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });
  if (row.count <= rule.limit) return { ok: true };
  return { ok: false, retryAfterMs: Math.max(0, row.windowStart.getTime() + rule.windowMs - now.getTime()) };
}

/** Clears a key, e.g. an email's failed-login count after a successful sign-in. */
export async function clearRateLimit(db: Db, key: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}

/** Deletes counters whose window ended long ago. The longest window is an hour. */
export async function pruneRateLimits(db: Db, now: Date = new Date()): Promise<void> {
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now.getTime() - 24 * 60 * MINUTE)));
}

export function tooManyAttempts(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / MINUTE));
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
