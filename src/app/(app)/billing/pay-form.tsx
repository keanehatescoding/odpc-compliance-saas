"use client";

import { useActionState } from "react";
import { startPayment } from "@/app/actions/billing";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/ui";
import { formatKsh } from "@/lib/dpa";
import type { BillingInterval } from "@/lib/plans";

export function PayForm({ interval, price, primary }: { interval: BillingInterval; price: number; primary?: boolean }) {
  const [state, action] = useActionState(startPayment, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="interval" value={interval} />
      <FormMessage message={state?.message} />
      <SubmitButton variant={primary ? "primary" : "secondary"} pendingText="Opening checkout…">
        Pay {formatKsh(price)} for a {interval}
      </SubmitButton>
    </form>
  );
}
