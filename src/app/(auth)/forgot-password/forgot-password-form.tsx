"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormMessage, TextField } from "@/components/ui";
import { RESET_LINK_SENT } from "@/lib/auth-messages";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <p className="mt-1 text-sm text-stone-600">Enter the email you sign in with. We&apos;ll send you a link to choose a new password.</p>
      <form action={action} className="mt-6 space-y-4">
        <FormMessage message={state?.message} tone={state?.message === RESET_LINK_SENT ? "success" : "error"} />
        <TextField name="email" label="Email" type="email" autoComplete="email" required errors={state?.errors} values={state?.values} />
        <SubmitButton pendingText="Sending…">Send reset link</SubmitButton>
      </form>
      <p className="mt-6 text-sm text-stone-600">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
