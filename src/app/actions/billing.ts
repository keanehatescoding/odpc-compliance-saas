"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { PAYMENTS_UNAVAILABLE, startCheckout } from "@/lib/billing";
import type { OrgSize } from "@/lib/dpa";
import type { FormState } from "@/lib/forms";
import { paystackFromEnv } from "@/lib/paystack";
import { BILLING_INTERVAL_KEYS, type BillingInterval } from "@/lib/plans";
import { hitRateLimit, RATE_LIMITS, tooManyAttempts } from "@/lib/rate-limit";
import { requireOrgContext } from "@/lib/session";

/** Starts a Paystack checkout for the chosen interval and sends the user there. */
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
    interval: interval.data,
    callbackUrl: `${appUrl}/billing/callback`,
  });
  if ("error" in result) return { message: result.error };
  redirect(result.url);
}
