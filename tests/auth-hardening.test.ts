import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import {
  changeEmail,
  issueVerificationToken,
  pruneVerificationTokens,
  verificationEmail,
  verifyEmail,
} from "@/lib/email-verification";
import { issueResetToken, isResetTokenValid, pruneResetTokens, resetEmail, resetPassword } from "@/lib/password-reset";
import { clearRateLimit, hitRateLimit, pruneRateLimits, tooManyAttempts } from "@/lib/rate-limit";
import { hashToken } from "@/lib/tokens";

let db: Db;

beforeEach(async () => {
  const client = new PGlite();
  const pg = drizzle({ client, schema });
  await migrate(pg, { migrationsFolder: "drizzle" });
  db = pg as unknown as Db;
});

const t0 = new Date("2026-10-03T09:00:00Z");
const after = (ms: number) => new Date(t0.getTime() + ms);
const MIN = 60_000;

describe("hitRateLimit", () => {
  const rule = { limit: 3, windowMs: 15 * MIN };

  it("allows up to the limit in a window, then blocks until it ends", async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await hitRateLimit(db, "login:email:a@x.ke", rule, after(i * MIN)));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false, false]);
    // Window opened at t0, so the 5th attempt (t0 + 4 min) waits 11 more minutes.
    expect(results[4]).toEqual({ ok: false, retryAfterMs: 11 * MIN });

    expect(await hitRateLimit(db, "login:email:a@x.ke", rule, after(15 * MIN))).toEqual({ ok: true });
  });

  it("keeps keys separate", async () => {
    for (let i = 0; i < 3; i++) await hitRateLimit(db, "a", rule, t0);
    expect((await hitRateLimit(db, "a", rule, t0)).ok).toBe(false);
    expect((await hitRateLimit(db, "b", rule, t0)).ok).toBe(true);
  });

  it("counts concurrent attempts without losing any", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => hitRateLimit(db, "k", rule, t0)));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
  });

  it("resets when cleared", async () => {
    for (let i = 0; i < 4; i++) await hitRateLimit(db, "k", rule, t0);
    await clearRateLimit(db, "k");
    expect((await hitRateLimit(db, "k", rule, t0)).ok).toBe(true);
  });

  it("prunes counters older than a day", async () => {
    await hitRateLimit(db, "old", rule, t0);
    await hitRateLimit(db, "new", rule, after(23 * 60 * MIN));
    await pruneRateLimits(db, after(24 * 60 * MIN + 1));
    const keys = (await db.select().from(schema.rateLimits)).map((r) => r.key);
    expect(keys).toEqual(["new"]);
  });

  it("words the wait in whole minutes", () => {
    expect(tooManyAttempts(30_000)).toBe("Too many attempts. Try again in 1 minute.");
    expect(tooManyAttempts(11 * MIN - 1)).toBe("Too many attempts. Try again in 11 minutes.");
  });
});

describe("password reset", () => {
  async function user() {
    const [u] = await db
      .insert(schema.users)
      .values({ email: "wanjiru@sunrise.ac.ke", name: "Wanjiru", passwordHash: "old-hash" })
      .returning();
    await db.insert(schema.sessions).values([
      { id: "s1", userId: u.id, expiresAt: after(30 * 24 * 60 * MIN) },
      { id: "s2", userId: u.id, expiresAt: after(30 * 24 * 60 * MIN) },
    ]);
    return u;
  }

  it("stores only a hash of the token", async () => {
    const u = await user();
    const token = await issueResetToken(db, u.id, t0);
    const [row] = await db.select().from(schema.passwordResetTokens);
    expect(row.id).toBe(hashToken(token));
    expect(row.id).not.toContain(token);
  });

  it("sets the password, signs out everywhere, and works only once", async () => {
    const u = await user();
    const token = await issueResetToken(db, u.id, t0);
    expect(await isResetTokenValid(db, token, after(5 * MIN))).toBe(true);

    expect(await resetPassword(db, token, "new-hash", after(5 * MIN))).toBe(u.id);
    const [saved] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
    expect(saved.passwordHash).toBe("new-hash");
    expect(saved.emailVerifiedAt).toEqual(after(5 * MIN)); // the link proved they get mail there
    expect(await db.select().from(schema.sessions)).toHaveLength(0);

    expect(await isResetTokenValid(db, token, after(6 * MIN))).toBe(false);
    expect(await resetPassword(db, token, "other-hash", after(6 * MIN))).toBeNull();
  });

  it("lets only one of two concurrent submissions through", async () => {
    const u = await user();
    const token = await issueResetToken(db, u.id, t0);
    const results = await Promise.all([resetPassword(db, token, "a", t0), resetPassword(db, token, "b", t0)]);
    expect(results.filter(Boolean)).toEqual([u.id]);
  });

  it("expires after an hour", async () => {
    const u = await user();
    const token = await issueResetToken(db, u.id, t0);
    expect(await isResetTokenValid(db, token, after(60 * MIN))).toBe(false);
    expect(await resetPassword(db, token, "new-hash", after(60 * MIN))).toBeNull();
    const [saved] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
    expect(saved.passwordHash).toBe("old-hash");
    expect(await db.select().from(schema.sessions)).toHaveLength(2);
  });

  it("rejects unknown tokens", async () => {
    await user();
    expect(await isResetTokenValid(db, "nope", t0)).toBe(false);
    expect(await resetPassword(db, "nope", "new-hash", t0)).toBeNull();
  });

  it("invalidates earlier links when a new one is issued", async () => {
    const u = await user();
    const first = await issueResetToken(db, u.id, t0);
    const second = await issueResetToken(db, u.id, after(MIN));
    expect(await isResetTokenValid(db, first, after(2 * MIN))).toBe(false);
    expect(await isResetTokenValid(db, second, after(2 * MIN))).toBe(true);
  });

  it("prunes expired tokens", async () => {
    const u = await user();
    await issueResetToken(db, u.id, t0);
    await pruneResetTokens(db, after(59 * MIN));
    expect(await db.select().from(schema.passwordResetTokens)).toHaveLength(1);
    await pruneResetTokens(db, after(60 * MIN));
    expect(await db.select().from(schema.passwordResetTokens)).toHaveLength(0);
  });

  it("emails the link with its expiry", () => {
    const m = resetEmail("wanjiru@sunrise.ac.ke", "Wanjiru", "https://app.test/reset-password?token=abc");
    expect(m.to).toEqual(["wanjiru@sunrise.ac.ke"]);
    expect(m.text).toContain("https://app.test/reset-password?token=abc");
    expect(m.text).toContain("expires in 1 hour");
  });
});

describe("email verification", () => {
  async function user(email = "wanjiru@sunrise.ac.ke") {
    const [u] = await db.insert(schema.users).values({ email, name: "Wanjiru", passwordHash: "x" }).returning();
    return u;
  }
  const verifiedAt = async (id: string) =>
    (await db.select().from(schema.users).where(eq(schema.users.id, id)))[0].emailVerifiedAt;

  it("marks the email verified and works only once", async () => {
    const u = await user();
    expect(await verifiedAt(u.id)).toBeNull();
    const token = await issueVerificationToken(db, u.id, u.email, t0);
    const [row] = await db.select().from(schema.emailVerificationTokens);
    expect(row.id).toBe(hashToken(token));

    expect(await verifyEmail(db, token, after(MIN))).toBe(u.id);
    expect(await verifiedAt(u.id)).toEqual(after(MIN));
    expect(await verifyEmail(db, token, after(2 * MIN))).toBeNull();
  });

  it("expires after 24 hours", async () => {
    const u = await user();
    const token = await issueVerificationToken(db, u.id, u.email, t0);
    expect(await verifyEmail(db, token, after(24 * 60 * MIN))).toBeNull();
    expect(await verifiedAt(u.id)).toBeNull();
  });

  it("rejects unknown tokens", async () => {
    await user();
    expect(await verifyEmail(db, "nope", t0)).toBeNull();
  });

  it("invalidates earlier links when a new one is issued", async () => {
    const u = await user();
    const first = await issueVerificationToken(db, u.id, u.email, t0);
    const second = await issueVerificationToken(db, u.id, u.email, after(MIN));
    expect(await verifyEmail(db, first, after(2 * MIN))).toBeNull();
    expect(await verifyEmail(db, second, after(2 * MIN))).toBe(u.id);
  });

  it("ignores a link sent to an address the user has since changed", async () => {
    const u = await user("wanjiru@sunrsie.ac.ke");
    const token = await issueVerificationToken(db, u.id, u.email, t0);
    await db.update(schema.users).set({ email: "wanjiru@sunrise.ac.ke" }).where(eq(schema.users.id, u.id));
    expect(await verifyEmail(db, token, after(MIN))).toBeNull();
    expect(await verifiedAt(u.id)).toBeNull();
  });

  it("revokes reset links when the email changes, so they can't verify the new address", async () => {
    const u = await user("wanjiru@sunrise.ac.ke");
    const reset = await issueResetToken(db, u.id, t0);
    await changeEmail(db, u.id, "someone-else@example.com");
    expect(await resetPassword(db, reset, "new-hash", after(MIN))).toBeNull();
    expect(await verifiedAt(u.id)).toBeNull();
  });

  it("prunes expired tokens", async () => {
    const u = await user();
    await issueVerificationToken(db, u.id, u.email, t0);
    await pruneVerificationTokens(db, after(24 * 60 * MIN - 1));
    expect(await db.select().from(schema.emailVerificationTokens)).toHaveLength(1);
    await pruneVerificationTokens(db, after(24 * 60 * MIN));
    expect(await db.select().from(schema.emailVerificationTokens)).toHaveLength(0);
  });

  it("emails the link with its expiry", () => {
    const m = verificationEmail("wanjiru@sunrise.ac.ke", "Wanjiru", "https://app.test/verify-email/confirm?token=abc");
    expect(m.to).toEqual(["wanjiru@sunrise.ac.ke"]);
    expect(m.text).toContain("https://app.test/verify-email/confirm?token=abc");
    expect(m.text).toContain("expires in 24 hours");
  });
});
