"use client";

import { useActionState } from "react";
import { changeAutoRenew, removeCard } from "@/app/actions/billing";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage, SelectField } from "@/components/ui";

const CHOICES = { month: "Renew monthly", year: "Renew annually", off: "Don't renew automatically" };

export function RenewalForm({ current }: { current: keyof typeof CHOICES }) {
  const [state, action] = useActionState(changeAutoRenew, undefined);
  const [removeState, remove] = useActionState(removeCard, undefined);
  return (
    <div className="mt-4 space-y-3">
      <FormMessage message={state?.message} tone={state?.message === "Saved." ? "success" : "error"} />
      <FormMessage message={removeState?.message} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <SelectField name="renew" label="Automatic renewal" options={CHOICES} initial={current} />
          <SubmitButton variant="secondary">Save</SubmitButton>
        </form>
        <form action={remove}>
          <SubmitButton variant="secondary" pendingText="Removing…">
            Remove card
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
