"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormMessage, SelectField, TextField } from "@/components/ui";
import { ORG_SIZES, SECTORS } from "@/lib/dpa";

export function SignupForm() {
  const [state, action] = useActionState(signup, undefined);
  const f = { errors: state?.errors, values: state?.values };
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-stone-600">Set up your organisation. You can change these details later.</p>
      <form action={action} className="mt-6 space-y-4">
        <FormMessage message={state?.message} />
        <TextField name="name" label="Your name" autoComplete="name" required {...f} />
        <TextField name="email" label="Work email" type="email" autoComplete="email" required {...f} />
        <TextField
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters."
          required
          errors={state?.errors}
        />
        <hr className="border-stone-200" />
        <TextField name="orgName" label="Organisation name" autoComplete="organization" required {...f} />
        <SelectField name="sector" label="Sector" options={SECTORS} placeholder="Choose a sector" {...f} />
        <SelectField
          name="size"
          label="Size"
          options={ORG_SIZES}
          placeholder="Choose a size"
          hint="Sets the indicative ODPC fee band."
          {...f}
        />
        <SubmitButton pendingText="Creating account…">Create account</SubmitButton>
      </form>
      <p className="mt-6 text-sm text-stone-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
