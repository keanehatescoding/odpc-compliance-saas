"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { removeSavedCard, setAutoRenew } from "@/lib/auto-renew";
import { PAYMENTS_UNAVAILABLE, startCheckout } from "@/lib/billing";
import type { OrgSize } from "@/lib/dpa";
import { createEmailSender } from "@/lib/email";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { paystackFromEnv } from "@/lib/paystack";
import { BILLING_INTERVAL_KEYS, type BillingInterval } from "@/lib/plans";
import { SERVICE_KEYS, SERVICE_NOTES_MAX, type ServiceKey } from "@/lib/services";
import { hitRateLimit, RATE_LIMITS, tooManyAttempts } from "@/lib/rate-limit";
import { requireOrgContext } from "@/lib/session";

/**
 * Starts a Paystack checkout for the chosen interval and sends the user there.
 * Ticking save_card agrees to keep the card for automatic renewal.
 */
export async function startPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org, role } = await requireOrgContext();
  if (role === "member") return { message: "Only owners and admins can pay for Kinga." };
  const interval = z.enum(BILLING_INTERVAL_KEYS as [BillingInterval, ...BillingInterval[]]).safeParse(formData.get("interval"));
  if (!interval.success) return { message: "Choose monthly or annual." };

  const paystack = paystackFromEnv();
  if (!paystack) return { message: PAYMENTS_UNAVAILABLE };

  // Each attempt creates a payment record and calls Paystack.
  const limit = await hitRateLimit(db, `checkout:user:${user.id}`, RATE_LIMITS.checkoutUser);
  if (!limit.ok) return { message: tooManyAttempts(limit.retryAfterMs) };

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const result = await startCheckout(db, paystack, {
    orgId: org.id,
    userId: user.id,
    email: user.email,
    size: org.size as OrgSize,
    item: { kind: "subscription", interval: interval.data, saveCard: formData.get("save_card") === "on" },
    callbackUrl: `${appUrl}/billing/callback`,
  });
  if ("error" in result) return { message: result.error };
  redirect(result.url);
}

const serviceOrderSchema = z.object({
  service: z.enum(SERVICE_KEYS as [ServiceKey, ...ServiceKey[]], { error: "Choose a service." }),
  notes: z
    .string()
    .trim()
    .max(SERVICE_NOTES_MAX, `Keep this under ${SERVICE_NOTES_MAX} characters.`)
    .transform((v) => v || null),
});

/**
 * Orders a one-off service: starts a Paystack checkout for it and sends the
 * user there. Open to lapsed organisations too.
 */
export async function startServicePayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org, role } = await requireOrgContext();
  if (role === "member") return { message: "Only owners and admins can order services." };
  const parsed = serviceOrderSchema.safeParse({ service: formData.get("service"), notes: formData.get("notes") ?? "" });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData) };

  const paystack = paystackFromEnv();
  if (!paystack) return { message: PAYMENTS_UNAVAILABLE, values: formValues(formData) };

  const limit = await hitRateLimit(db, `checkout:user:${user.id}`, RATE_LIMITS.checkoutUser);
  if (!limit.ok) return { message: tooManyAttempts(limit.retryAfterMs), values: formValues(formData) };

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const result = await startCheckout(db, paystack, {
    orgId: org.id,
    userId: user.id,
    email: user.email,
    size: org.size as OrgSize,
    item: { kind: "service", service: parsed.data.service, notes: parsed.data.notes },
    callbackUrl: `${appUrl}/billing/callback`,
  });
  if ("error" in result) return { message: result.error, values: formValues(formData) };
  redirect(result.url);
}

const RENEWAL_CHOICES = ["month", "year", "off"] as const;

/** Turns automatic renewal on (monthly or annual) or off, for the saved card. */
export async function changeAutoRenew(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org, role } = await requireOrgContext();
  if (role === "member") return { message: "Only owners and admins can change automatic renewal." };
  const choice = z.enum(RENEWAL_CHOICES).safeParse(formData.get("renew"));
  if (!choice.success) return { message: "Choose monthly, annual or off." };
  const result = await setAutoRenew(db, createEmailSender(), org.id, choice.data === "off" ? null : choice.data, user);
  if ("error" in result) return { message: result.error };
  revalidatePath("/billing");
  return { message: "Saved." };
}

/** Forgets the saved card, here and on Paystack. */
export async function removeCard(_prev: FormState): Promise<FormState> {
  const { user, org, role } = await requireOrgContext();
  if (role === "member") return { message: "Only owners and admins can remove the card." };
  const result = await removeSavedCard(db, paystackFromEnv(), createEmailSender(), org.id, user);
  if ("error" in result) return { message: result.error };
  revalidatePath("/billing");
}
