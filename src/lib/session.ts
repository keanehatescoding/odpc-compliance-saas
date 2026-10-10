import "server-only";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { memberships, organizations, sessions, users } from "@/db/schema";
import { accessFor } from "./plans";
import { isStaff } from "./staff";
import { hashToken, newToken } from "./tokens";

const COOKIE = "session";
const SESSION_DAYS = 30;

export async function createSession(userId: string): Promise<void> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  // Opportunistically clear out expired sessions for this user.
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  store.delete(COOKIE);
}

/** The id of the session row for this request's cookie, or null if there's no cookie. */
export async function currentSessionId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? hashToken(token) : null;
}

/** The signed-in user, or null. Cached per request. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const id = hashToken(token);
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  // Sessions last a fixed SESSION_DAYS, matching the cookie's expiry. (Cookies
  // can't be rewritten during render, so a DB-only sliding expiry would be moot.)
  const { passwordHash: _omit, ...user } = row.user;
  return user;
});

/**
 * The signed-in user and their organisation. Redirects to /login if signed
 * out, to /verify-email until they confirm their address, or to /no-organisation
 * if they don't belong to one (e.g. they were removed from the team). Every data access in the app is scoped by the returned `org.id`.
 */
export const requireOrgContext = cache(async () => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.emailVerifiedAt) redirect("/verify-email");
  const [row] = await db
    .select({ org: organizations, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, user.id))
    .orderBy(memberships.createdAt)
    .limit(1);
  if (!row) redirect("/no-organisation");
  return { user, org: row.org, role: row.role };
});

/**
 * requireOrgContext() for actions that change records. Once the trial or paid
 * period has lapsed, sends the user to the billing page instead. Breaches,
 * the team and settings don't use this, so they keep working.
 */
export async function requireActiveOrg() {
  const ctx = await requireOrgContext();
  if (accessFor(ctx.org).state === "lapsed") redirect("/billing?lapsed=1");
  return ctx;
}

export async function requireAdmin() {
  const ctx = await requireOrgContext();
  if (ctx.role === "member") throw new Error("Only owners and admins can do this.");
  return ctx;
}

/**
 * The signed-in Kinga staff member (see lib/staff), for /staff. Sends anyone
 * signed out to sign in, and shows anyone else a 404. Call it in every staff
 * page and action, not just the layout.
 */
export const requireStaff = cache(async () => {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/staff");
  if (!isStaff(user)) notFound();
  return user;
});
