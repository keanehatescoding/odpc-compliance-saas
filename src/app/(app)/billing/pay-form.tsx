"use client";

import { useActionState } from "react";
import { startPayment } from "@/app/actions/billing";
import { SubmitButton } from "@/components/submit-button";
import { CheckboxField, FormMessage } from "@/components/ui";
import { formatKsh } from "@/lib/dpa";
import type { BillingInterval } from "@/lib/plans";

export function PayForm({ prices, renewing }: { prices: Record<BillingInterval, number>; renewing: boolean }) {
  const [state, action] = useActionState(startPayment, undefined);
  return (
    <form action={action} className="mt-5 space-y-4">
      <FormMessage message={state?.message} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <SubmitButton name="interval" value="year" pendingText="Opening checkout…">
          Pay {formatKsh(prices.year)} for a year
        </SubmitButton>
        <SubmitButton name="interval" value="month" variant="secondary" pendingText="Opening checkout…">
          Pay {formatKsh(prices.month)} for a month
        </SubmitButton>
      </div>
      <CheckboxField
        name="save_card"
        label={renewing ? "Save this card for automatic renewal instead" : "Save my card and renew automatically"}
        hint="Card payments only. We'll charge the card for the same plan as each period ends, and email owners 3 days before. You can turn it off or remove the card here at any time."
      />
    </form>
  );
}
