"use client";

import Link from "next/link";
import { useActionState } from "react";
import { completePasswordReset } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormMessage, TextField } from "@/components/ui";
import { RESET_LINK_INVALID } from "@/lib/auth-messages";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(completePasswordReset, undefined);
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <p className="mt-1 text-sm text-stone-600">You&apos;ll be signed out on every other device.</p>
      <form action={action} className="mt-6 space-y-4">
        <FormMessage message={state?.message} />
        {state?.message === RESET_LINK_INVALID && (
          <Link href="/forgot-password" className="block text-sm font-medium text-brand-700 hover:underline">
            Send a new link
          </Link>
        )}
        <input type="hidden" name="token" value={token} />
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
        <SubmitButton pendingText="Saving…">Save password</SubmitButton>
      </form>
    </Card>
  );
}
