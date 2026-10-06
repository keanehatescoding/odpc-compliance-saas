"use client";

import { useActionState } from "react";
import { deleteAccountAction } from "@/app/actions/account";
import { SubmitButton } from "./submit-button";
import { FormMessage, TextField } from "./ui";

/** Deletes the signed-in user's account once they type their password. */
export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccountAction, undefined);
  return (
    <details className="group" open={Boolean(state)}>
      <summary className="cursor-pointer list-none text-sm font-medium text-red-700 hover:underline">Delete my account</summary>
      <form action={action} className="mt-4 max-w-sm space-y-4">
        <FormMessage message={state?.message} />
        <p className="text-sm text-stone-600">
          This signs you out and deletes your name, email and password. Records you wrote stay with the organisation.
          It can&apos;t be undone.
        </p>
        <TextField name="password" label="Your password" type="password" autoComplete="current-password" required errors={state?.errors} />
        <SubmitButton variant="danger" pendingText="Deleting…">
          Delete my account
        </SubmitButton>
      </form>
    </details>
  );
}
