"use client";

import { useActionState } from "react";
import { createOrganization } from "@/app/actions/team";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage, SelectField, TextField } from "@/components/ui";
import { ORG_SIZES, SECTORS } from "@/lib/dpa";

export function CreateOrganizationForm() {
  const [state, action] = useActionState(createOrganization, undefined);
  const f = { errors: state?.errors, values: state?.values };
  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage message={state?.message} />
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
      <SubmitButton pendingText="Creating…">Create organisation</SubmitButton>
    </form>
  );
}
