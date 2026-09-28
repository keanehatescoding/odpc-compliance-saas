"use server";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { memberships, organizations, users } from "@/db/schema";
import { ORG_SIZE_KEYS, SECTOR_KEYS, type OrgSize, type Sector } from "@/lib/dpa";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { getDummyHash, hashPassword, verifyPassword } from "@/lib/password";
import { createSession, destroySession } from "@/lib/session";

const email = z.email({ error: "Enter a valid email address." }).trim().toLowerCase();

const signupSchema = z.object({
  name: z.string().trim().min(2, { error: "Enter your name." }).max(120),
  email,
  password: z.string().min(10, { error: "Use at least 10 characters." }).max(200),
  orgName: z.string().trim().min(2, { error: "Enter your organisation's name." }).max(200),
  sector: z.enum(SECTOR_KEYS as [Sector, ...Sector[]], { error: "Choose a sector." }),
  size: z.enum(ORG_SIZE_KEYS as [OrgSize, ...OrgSize[]], { error: "Choose a size." }),
});

const EMAIL_TAKEN = "An account with this email already exists. Sign in instead.";

/** Postgres unique_violation, possibly wrapped by drizzle in `cause`. */
function isUniqueViolation(err: unknown): boolean {
  for (let e = err; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  delete values.password;
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const d = parsed.data;

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, d.email))
    .limit(1);
  if (existing) return { errors: { email: [EMAIL_TAKEN] }, values };

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

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(sql`lower(${users.email})`, parsed.data.email))
    .limit(1);
  // Always run a hash comparison so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) return { message: "Incorrect email or password.", values };

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
