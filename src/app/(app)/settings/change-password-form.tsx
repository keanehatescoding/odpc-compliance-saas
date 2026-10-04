"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormMessage, TextField } from "@/components/ui";
import { PASSWORD_CHANGED } from "@/lib/auth-messages";

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePassword, undefined);
  return (
    <Card className="max-w-2xl">
      <h2 className="text-base font-semibold">Password</h2>
      <p className="mt-1 text-sm text-stone-600">Changing it signs you out on every other device.</p>
      <form action={action} className="mt-5 space-y-5">
        <FormMessage message={state?.message} tone={state?.message === PASSWORD_CHANGED ? "success" : "error"} />
        <TextField name="current" label="Current password" type="password" autoComplete="current-password" required errors={state?.errors} />
        <TextField
          name="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters."
          required
          errors={state?.errors}
        />
        <TextField name="confirm" label="Confirm new password" type="password" autoComplete="new-password" required errors={state?.errors} />
        <SubmitButton pendingText="Saving…">Change password</SubmitButton>
      </form>
    </Card>
  );
}
