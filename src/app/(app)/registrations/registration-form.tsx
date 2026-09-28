"use client";

import { useActionState } from "react";
import { saveRegistration } from "@/app/actions/registrations";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormMessage, SelectField, TextArea, TextField } from "@/components/ui";
import { REGISTRATION_ROLES } from "@/lib/dpa";
import type { Registration } from "@/db/schema";

export function RegistrationForm({ registration }: { registration?: Registration }) {
  const [state, action] = useActionState(saveRegistration, undefined);
  const f = { errors: state?.errors, values: state?.values };
  return (
    <Card className="max-w-2xl">
      <form action={action} className="space-y-5">
        {registration && <input type="hidden" name="id" value={registration.id} />}
        <FormMessage message={state?.message} />
        <SelectField
          name="role"
          label="Registered as"
          options={REGISTRATION_ROLES}
          initial={registration?.role}
          placeholder="Choose one"
          hint="A controller decides why and how personal data is processed. A processor handles data on a controller's behalf."
          {...f}
        />
        <TextField name="certificateNumber" label="Certificate number" initial={registration?.certificateNumber ?? ""} {...f} />
        <div className="grid gap-5 sm:grid-cols-3">
          <TextField
            name="appliedOn"
            label="Application date"
            type="date"
            initial={registration?.appliedOn ?? ""}
            hint="Latest application or renewal filed."
            {...f}
          />
          <TextField name="issuedOn" label="Issue date" type="date" initial={registration?.issuedOn ?? ""} {...f} />
          <TextField
            name="expiresOn"
            label="Expiry date"
            type="date"
            initial={registration?.expiresOn ?? ""}
            hint="Leave blank to use issue date + 24 months."
            {...f}
          />
        </div>
        <TextArea name="notes" label="Notes" initial={registration?.notes ?? ""} {...f} />
        <SubmitButton>{registration ? "Save changes" : "Add registration"}</SubmitButton>
      </form>
    </Card>
  );
}
