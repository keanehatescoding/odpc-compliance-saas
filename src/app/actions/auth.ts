"use server";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { memberships, organizations, users } from "@/db/schema";
import { RESET_LINK_INVALID, RESET_LINK_SENT } from "@/lib/auth-messages";
import { isUniqueViolation } from "@/lib/db-errors";
import { ORG_SIZE_KEYS, SECTOR_KEYS, type OrgSize, type Sector } from "@/lib/dpa";
import { createEmailSender } from "@/lib/email";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { getDummyHash, hashPassword, verifyPassword } from "@/lib/password";
import { issueResetToken, resetEmail, resetPassword } from "@/lib/password-reset";
import { clearRateLimit, hitRateLimit, RATE_LIMITS, tooManyAttempts, type RateLimitRule } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { createSession, destroySession } from "@/lib/session";

const email = z.email({ error: "Enter a valid email address." }).trim().toLowerCase();

const newPassword = z.string().min(10, { error: "Use at least 10 characters." }).max(200);

const signupSchema = z.object({
  name: z.string().trim().min(2, { error: "Enter your name." }).max(120),
  email,
  password: newPassword,
  orgName: z.string().trim().min(2, { error: "Enter your organisation's name." }).max(200),
  sector: z.enum(SECTOR_KEYS as [Sector, ...Sector[]], { error: "Choose a sector." }),
  size: z.enum(ORG_SIZE_KEYS as [OrgSize, ...OrgSize[]], { error: "Choose a size." }),
});

const EMAIL_TAKEN = "An account with this email already exists. Sign in instead.";

/**
 * Counts this attempt against each bucket. Returns an error message if any is
 * over its limit. A null key (e.g. no client IP) skips that bucket.
 */
async function rateLimited(buckets: [key: string | null, rule: RateLimitRule][]): Promise<string | undefined> {
  let retryAfterMs = 0;
  for (const [key, rule] of buckets) {
    if (!key) continue;
    const r = await hitRateLimit(db, key, rule);
    if (!r.ok) retryAfterMs = Math.max(retryAfterMs, r.retryAfterMs);
  }
  return retryAfterMs > 0 ? tooManyAttempts(retryAfterMs) : undefined;
}

const ipKey = (action: string, ip: string | null) => (ip ? `${action}:ip:${ip}` : null);

async function findUserByEmail(address: string) {
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(sql`lower(${users.email})`, address))
    .limit(1);
  return user;
}

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  delete values.password;
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const d = parsed.data;

  const limited = await rateLimited([[ipKey("signup", await clientIp()), RATE_LIMITS.signupIp]]);
  if (limited) return { message: limited, values };

  if (await findUserByEmail(d.email)) return { errors: { email: [EMAIL_TAKEN] }, values };

  const passwordHash = await hashPassword(d.password);
  let userId: string;
  try {
    userId = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: d.email, name: d.name, passwordHash })
        .returning({ id: users.id });
      const [org] = await tx
        .insert(organizations)
        .values({ name: d.orgName, sector: d.sector, size: d.size })
        .returning({ id: organizations.id });
      await tx.insert(memberships).values({ userId: user.id, orgId: org.id, role: "owner" });
      return user.id;
    });
  } catch (err) {
    // A concurrent signup with the same email won the race to the unique index.
    if (isUniqueViolation(err)) return { errors: { email: [EMAIL_TAKEN] }, values };
    throw err;
  }

  await createSession(userId);
  redirect("/dashboard");
}

const loginSchema = z.object({ email, password: z.string().min(1, { error: "Enter your password." }) });

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: String(formData.get("email") ?? "") };
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  // Per email, to slow guessing one account's password; per IP, to slow
  // trying one password against many accounts.
  const emailKey = `login:email:${parsed.data.email}`;
  const limited = await rateLimited([
    [ipKey("login", await clientIp()), RATE_LIMITS.loginIp],
    [emailKey, RATE_LIMITS.loginEmail],
  ]);
  if (limited) return { message: limited, values };

  const user = await findUserByEmail(parsed.data.email);
  // Always run a hash comparison so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) return { message: "Incorrect email or password.", values };

  await clearRateLimit(db, emailKey);
  await createSession(user.id);
  redirect("/dashboard");
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: String(formData.get("email") ?? "") };
  const parsed = z.object({ email }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  // The email bucket stops anyone using this form to flood an inbox. It counts
  // every address, registered or not, so hitting it reveals nothing.
  const limited = await rateLimited([
    [ipKey("reset-request", await clientIp()), RATE_LIMITS.resetRequestIp],
    [`reset-request:email:${parsed.data.email}`, RATE_LIMITS.resetRequestEmail],
  ]);
  if (limited) return { message: limited, values };

  const user = await findUserByEmail(parsed.data.email);
  if (user) {
    // Issue and send after responding, so response time doesn't reveal whether the account exists.
    after(async () => {
      try {
        const token = await issueResetToken(db, user.id);
        const appUrl = process.env.APP_URL ?? "http://localhost:3000";
        const link = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
        await createEmailSender()(resetEmail(user.email, user.name, link));
      } catch (err) {
        console.error("Failed to send password reset email", err);
      }
    });
  }
  return { message: RESET_LINK_SENT, values };
}

export async function completePasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ token: z.string().min(1), password: newPassword, confirm: z.string() })
    .refine((d) => d.password === d.confirm, { path: ["confirm"], error: "The passwords don't match." })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const limited = await rateLimited([[ipKey("reset-submit", await clientIp()), RATE_LIMITS.resetSubmitIp]]);
  if (limited) return { message: limited };

  const userId = await resetPassword(db, parsed.data.token, await hashPassword(parsed.data.password));
  if (!userId) return { message: RESET_LINK_INVALID };

  await createSession(userId);
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
