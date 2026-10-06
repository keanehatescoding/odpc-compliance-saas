"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { deleteAccount, deleteOrganization, organizationDeletedEmail } from "@/lib/account";
import { sellerFromEnv } from "@/lib/billing";
import { createEmailSender } from "@/lib/email";
import type { FormState } from "@/lib/forms";
import { verifyPassword } from "@/lib/password";
import { paystackFromEnv } from "@/lib/paystack";
import { hitRateLimit, RATE_LIMITS, tooManyAttempts } from "@/lib/rate-limit";
import { destroySession, getCurrentUser, requireOrgContext } from "@/lib/session";

/** Checks the password typed to confirm a deletion. Returns an error to show, or null. */
async function confirmPassword(userId: string, password: string): Promise<string | null> {
  const limit = await hitRateLimit(db, `delete-confirm:user:${userId}`, RATE_LIMITS.deleteConfirmUser);
  if (!limit.ok) return tooManyAttempts(limit.retryAfterMs);
  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId));
  if (!password || !row || !(await verifyPassword(password, row.passwordHash))) return "That isn't your password.";
  return null;
}

/** Deletes the organisation, for an owner who has typed its name and their password. */
export async function deleteOrganizationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org, role } = await requireOrgContext();
  if (role !== "owner") return { message: "Only an owner can delete the organisation." };
  const confirmName = String(formData.get("confirmName") ?? "").trim();
  if (confirmName !== org.name.trim()) {
    return { errors: { confirmName: [`Type ${org.name} exactly as shown.`] }, values: { confirmName } };
  }
  const wrong = await confirmPassword(user.id, String(formData.get("password") ?? ""));
  if (wrong) return { errors: { password: [wrong] }, values: { confirmName } };

  const result = await deleteOrganization(db, { orgId: org.id, actorId: user.id });
  if ("error" in result) return { message: result.error, values: { confirmName } };

  after(async () => {
    const paystack = paystackFromEnv();
    if (result.card && paystack) {
      await paystack
        .deactivateAuthorization(result.card.authorizationCode)
        .catch((err) => console.error("Failed to deactivate card on Paystack", org.id, err));
    }
    const send = createEmailSender();
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const contact = sellerFromEnv().email;
    for (const person of result.team) {
      await send(organizationDeletedEmail(person.email, { orgName: result.orgName, deletedBy: user, appUrl, contact })).catch((err) =>
        console.error("Failed to send organisation deleted email", org.id, err),
      );
    }
  });
  redirect("/no-organisation?deleted=1");
}

/** Deletes the signed-in user's own account, once they've typed their password. */
export async function deleteAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const wrong = await confirmPassword(user.id, String(formData.get("password") ?? ""));
  if (wrong) return { errors: { password: [wrong] } };

  const error = await deleteAccount(db, user.id);
  if (error) return { message: error };
  await destroySession();
  redirect("/?account=deleted");
}
