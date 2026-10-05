"use client";

import { useActionState } from "react";
import { joinOrganization, signupFromInvitation } from "@/app/actions/team";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage, TextField } from "@/components/ui";

export function JoinForm({ token, orgName }: { token: string; orgName: string }) {
  const [state, action] = useActionState(joinOrganization, undefined);
  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage message={state?.message} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingText="Joining…">Join {orgName}</SubmitButton>
    </form>
  );
}

export function InviteSignupForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState(signupFromInvitation, undefined);
  const f = { errors: state?.errors, values: state?.values };
  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage message={state?.message} />
      <input type="hidden" name="token" value={token} />
      <TextField name="email" label="Email" type="email" initial={email} hint="The invitation is for this address." readOnly />
      <TextField name="name" label="Your name" autoComplete="name" required {...f} />
      <TextField
        name="password"
        label="Choose a password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters."
        required
        errors={state?.errors}
      />
      <SubmitButton pendingText="Creating account…">Create account and join</SubmitButton>
    </form>
  );
}
