"use client";

import { useActionState } from "react";
import { updateOrganization } from "@/app/actions/settings";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormMessage, SelectField, TextField } from "@/components/ui";
import type { Organization } from "@/db/schema";
import { ORG_SIZES, SECTORS } from "@/lib/dpa";

export function SettingsForm({ org, canEdit, ownerEmails }: { org: Organization; canEdit: boolean; ownerEmails: string[] }) {
  const [state, action] = useActionState(updateOrganization, undefined);
  const f = { errors: state?.errors, values: state?.values };
  return (
    <Card className="max-w-2xl">
      <form action={action} className="space-y-5">
        <FormMessage message={state?.message} tone={state?.message === "Saved." ? "success" : "error"} />
        <fieldset disabled={!canEdit} className="space-y-5">
          <TextField name="name" label="Organisation name" initial={org.name} {...f} />
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField name="sector" label="Sector" options={SECTORS} initial={org.sector} {...f} />
            <SelectField name="size" label="Size" options={ORG_SIZES} initial={org.size} {...f} />
          </div>
          <TextField name="kraPin" label="KRA PIN" placeholder="P051234567X" initial={org.kraPin ?? ""} {...f} />
          <TextField
            name="reminderEmail"
            label="Send renewal reminders to"
            placeholder={ownerEmails.join(", ")}
            hint={`Comma-separated. Leave blank to send to account owners (${ownerEmails.join(", ")}).`}
            initial={org.reminderEmail ?? ""}
            {...f}
          />
        </fieldset>
        {canEdit ? <SubmitButton>Save settings</SubmitButton> : <p className="text-sm text-stone-600">Only owners and admins can change these settings.</p>}
      </form>
    </Card>
  );
}
