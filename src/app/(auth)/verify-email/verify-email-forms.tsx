"use client";

import { useActionState } from "react";
import { changeUnverifiedEmail, resendVerificationEmail } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage, TextField } from "@/components/ui";
import { VERIFY_LINK_SENT } from "@/lib/auth-messages";

export function ResendForm() {
  const [state, action] = useActionState(resendVerificationEmail, undefined);
  return (
    <form action={action} className="space-y-4">
      <FormMessage message={state?.message} tone={state?.message === VERIFY_LINK_SENT ? "success" : "error"} />
      <SubmitButton variant="secondary" pendingText="Sending…">
        Send a new link
      </SubmitButton>
    </form>
  );
}

export function ChangeEmailForm({ email }: { email: string }) {
  const [state, action] = useActionState(changeUnverifiedEmail, undefined);
  return (
    <details className="mt-6 border-t border-stone-200 pt-4" open={Boolean(state)}>
      <summary className="cursor-pointer text-sm font-medium text-brand-700">Wrong address?</summary>
      <form action={action} className="mt-4 space-y-4">
        <FormMessage message={state?.message} />
        <TextField
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          errors={state?.errors}
          values={state?.values}
          initial={email}
        />
        <SubmitButton pendingText="Saving…">Change email and resend</SubmitButton>
      </form>
    </details>
  );
}
