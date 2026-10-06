"use client";

import { useActionState } from "react";
import { startServicePayment } from "@/app/actions/billing";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage, SelectField, TextArea } from "@/components/ui";
import { SERVICE_NOTES_MAX } from "@/lib/services";

export function OrderForm({ options, initial }: { options: Record<string, string>; initial?: string }) {
  const [state, action] = useActionState(startServicePayment, undefined);
  return (
    <form action={action} className="space-y-4">
      <FormMessage message={state?.message} />
      <SelectField
        name="service"
        label="Service"
        options={options}
        placeholder="Choose a service"
        initial={initial}
        errors={state?.errors}
        values={state?.values}
      />
      <TextArea
        name="notes"
        label="What should we cover?"
        hint="For a DPIA review, name the impact assessment. For an audit, tell us about anything you're worried about. We'll contact you after payment to arrange the rest."
        maxLength={SERVICE_NOTES_MAX}
        rows={4}
        errors={state?.errors}
        values={state?.values}
      />
      <SubmitButton pendingText="Opening checkout…">Continue to payment</SubmitButton>
    </form>
  );
}
