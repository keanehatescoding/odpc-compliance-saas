"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormMessage, TextField } from "@/components/ui";

export function LoginForm({
  notice,
  next,
  email,
}: {
  notice?: { message: string; tone: "error" | "success" };
  next?: string;
  email?: string;
}) {
  const [state, action] = useActionState(login, undefined);
  const f = { errors: state?.errors, values: state?.values };
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <form action={action} className="mt-6 space-y-4">
        {state?.message ? <FormMessage message={state.message} /> : notice && <FormMessage {...notice} />}
        {next && <input type="hidden" name="next" value={next} />}
        <TextField name="email" label="Email" type="email" autoComplete="email" initial={email} required {...f} />
        <TextField
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          hint={
            <Link href="/forgot-password" className="text-brand-700 hover:underline">
              Forgot your password?
            </Link>
          }
          required
          errors={state?.errors}
        />
        <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
      </form>
      <p className="mt-6 text-sm text-stone-600">
        New here?{" "}
        <Link href="/signup" className="font-medium text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>
    </Card>
  );
}
