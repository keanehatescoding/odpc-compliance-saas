"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { invitations, memberships, organizations, users, type MemberRole } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { isUniqueViolation } from "@/lib/db-errors";
import { ORG_SIZE_KEYS, SECTOR_KEYS, type OrgSize, type Sector } from "@/lib/dpa";
import { createEmailSender } from "@/lib/email";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { termsAgreed, TERMS_VERSION } from "@/lib/legal";
import { hashPassword } from "@/lib/password";
import { hitRateLimit, RATE_LIMITS, tooManyAttempts } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { createSession, getCurrentUser, requireOrgContext } from "@/lib/session";
import {
  acceptInvitation,
  changeMemberRole,
  createAccountFromInvitation,
  invitationEmail,
  issueInvitation,
  removeMember,
  revokeInvitation,
} from "@/lib/team";
import { isUuid } from "@/lib/uuid";

const ROLES = ["owner", "admin", "member"] as const satisfies MemberRole[];

const inviteSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }).trim().toLowerCase(),
  role: z.enum(ROLES, { error: "Choose a role." }),
});

/** Invites someone, or re-invites them with a fresh link. Sends the email after responding. */
async function invite(
  ctx: Awaited<ReturnType<typeof requireOrgContext>>,
  email: string,
  role: MemberRole,
): Promise<string | undefined> {
  // Each invitation emails an address the inviter chooses, so cap how many one person can send.
  const limit = await hitRateLimit(db, `invite-send:user:${ctx.user.id}`, RATE_LIMITS.inviteSendUser);
  if (!limit.ok) return tooManyAttempts(limit.retryAfterMs);

  const result = await issueInvitation(db, { orgId: ctx.org.id, actorId: ctx.user.id, email, role });
  if ("error" in result) return result.error;

  after(async () => {
    try {
      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      const link = `${appUrl}/invite?token=${encodeURIComponent(result.token)}`;
      await createEmailSender()(invitationEmail(email, { orgName: ctx.org.name, inviterName: ctx.user.name, role, link }));
    } catch (err) {
      console.error("Failed to send invitation email", err);
    }
  });
  revalidatePath("/team");
}

export async function inviteMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireOrgContext();
  const values = formValues(formData);
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const error = await invite(ctx, parsed.data.email, parsed.data.role);
  if (error) return { message: error, values };
  return { message: `Invitation sent to ${parsed.data.email}.` };
}

export async function resendInvitation(invitationId: string, _prev: FormState): Promise<FormState> {
  const ctx = await requireOrgContext();
  if (!isUuid(invitationId)) return { message: "Invitation not found." };
  const [row] = await db
    .select({ email: invitations.email, role: invitations.role })
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.orgId, ctx.org.id)));
  if (!row) return { message: "Invitation not found." };

  const error = await invite(ctx, row.email, row.role);
  return { message: error ?? "Sent a new link." };
}

export async function withdrawInvitation(invitationId: string, _prev: FormState): Promise<FormState> {
  const { user, org } = await requireOrgContext();
  if (!isUuid(invitationId)) return { message: "Invitation not found." };
  const error = await revokeInvitation(db, org.id, user.id, invitationId);
  if (error) return { message: error };
  revalidatePath("/team");
}

export async function updateMemberRole(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireOrgContext();
  const role = z.enum(ROLES).safeParse(formData.get("role"));
  if (!isUuid(userId) || !role.success) return { message: "Choose a role." };
  const error = await changeMemberRole(db, { orgId: org.id, actorId: user.id, userId, role: role.data });
  if (error) return { message: error };
  revalidatePath("/", "layout");
  return { message: "Saved." };
}

export async function removeTeamMember(userId: string, _prev: FormState): Promise<FormState> {
  const { user, org } = await requireOrgContext();
  if (!isUuid(userId)) return { message: "That person isn't on the team any more." };
  const error = await removeMember(db, { orgId: org.id, actorId: user.id, userId });
  if (error) return { message: error };
  revalidatePath("/team");
}

// ---------------------------------------------------------------------------
// Accepting an invitation (the /invite page).
// ---------------------------------------------------------------------------

/** Joins the inviting organisation as the signed-in user. */
export async function joinOrganization(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const token = String(formData.get("token") ?? "");
  const result = await acceptInvitation(db, token, user.id);
  if ("error" in result) {
    // The page explains each case; a reload shows the current one.
    revalidatePath("/invite");
    return { message: "We couldn't accept this invitation. It may have expired or already been used." };
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

const inviteSignupSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(2, { error: "Enter your name." }).max(120),
  password: z.string().min(10, { error: "Use at least 10 characters." }).max(200),
  terms: termsAgreed,
});

/** Creates an account for the invited address and signs it in. */
export async function signupFromInvitation(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { name: String(formData.get("name") ?? "") };
  const parsed = inviteSignupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const ip = await clientIp();
  if (ip) {
    const limit = await hitRateLimit(db, `signup:ip:${ip}`, RATE_LIMITS.signupIp);
    if (!limit.ok) return { message: tooManyAttempts(limit.retryAfterMs), values };
  }

  let userId: string | null;
  try {
    userId = await createAccountFromInvitation(db, parsed.data.token, {
      name: parsed.data.name,
      passwordHash: await hashPassword(parsed.data.password),
      termsVersion: TERMS_VERSION,
    });
  } catch (err) {
    // Someone created an account with this address since the page loaded.
    if (isUniqueViolation(err)) return { message: "An account with this email already exists. Sign in to accept.", values };
    throw err;
  }
  if (!userId) return { message: "This invitation has expired or has already been used. Ask for a new one.", values };

  await createSession(userId);
  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// Signed-in users who don't belong to an organisation (e.g. removed from one).
// ---------------------------------------------------------------------------

const orgSchema = z.object({
  orgName: z.string().trim().min(2, { error: "Enter your organisation's name." }).max(200),
  sector: z.enum(SECTOR_KEYS as [Sector, ...Sector[]], { error: "Choose a sector." }),
  size: z.enum(ORG_SIZE_KEYS as [OrgSize, ...OrgSize[]], { error: "Choose a size." }),
});

export async function createOrganization(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.emailVerifiedAt) redirect("/verify-email");
  const values = formValues(formData);
  const parsed = orgSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  await db.transaction(async (tx) => {
    // Locked so a double submit can't create two organisations.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for("update");
    const [existing] = await tx.select().from(memberships).where(eq(memberships.userId, user.id)).limit(1);
    if (existing) return;
    const [org] = await tx
      .insert(organizations)
      .values({ name: parsed.data.orgName, sector: parsed.data.sector, size: parsed.data.size })
      .returning({ id: organizations.id });
    await tx.insert(memberships).values({ userId: user.id, orgId: org.id, role: "owner" });
    await recordActivity(tx, { orgId: org.id, actorId: user.id, area: "organization", subjectId: org.id, summary: "created the organisation" });
  });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
