"use client";

import { useActionState } from "react";
import { saveParticularChange } from "@/app/actions/particulars";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormMessage, SelectField, TextArea, TextField } from "@/components/ui";
import type { ParticularChange } from "@/db/schema";

const ROLE_OPTIONS = {
  controller: "Data controller registration",
  processor: "Data processor registration",
  both: "Both, or the organisation's own details",
};

export function ParticularChangeForm({
  change,
  prefill,
  today,
}: {
  change?: ParticularChange;
  /** From the prompt shown after a RoPA or settings edit. */
  prefill?: { role: string; description: string; changedOn: string };
  today: string;
}) {
  const [state, action] = useActionState(saveParticularChange, undefined);
  const f = { errors: state?.errors, values: state?.values };

  return (
    <form action={action} className="max-w-3xl space-y-6">
      {change && <input type="hidden" name="id" value={change.id} />}
      <FormMessage message={state?.message} />
      {state?.errors && <FormMessage message="Some fields need attention. See the messages below." />}

      <Card className="space-y-5">
        <h2 className="font-semibold">What changed</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            name="role"
            label="Registration"
            options={ROLE_OPTIONS}
            hint="The certificate whose particulars no longer match."
            initial={change ? (change.role ?? "both") : (prefill?.role ?? "")}
            placeholder="Choose a registration"
            {...f}
          />
          <TextField
            name="changedOn"
            label="Date of the change"
            type="date"
            max={today}
            hint="The 14 days to notify count from this date."
            initial={change?.changedOn ?? prefill?.changedOn ?? today}
            {...f}
          />
        </div>
        <TextArea
          name="description"
          label="What changed"
          rows={3}
          placeholder="e.g. Started sending payroll data to a provider in South Africa. Added CCTV at the Nakuru branch. New postal address."
          hint="Name the particular as the register has it: your name or contact details, a purpose, who the data is about, what data, who receives it, transfers outside Kenya, or security measures."
          initial={change?.description ?? prefill?.description}
          {...f}
        />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">Notice to the ODPC</h2>
        <p className="text-sm text-stone-600">
          Write to the Data Commissioner, or update the details on the ODPC registration portal if it offers that, then record it
          here. Leave these blank until it&apos;s sent.
        </p>
        <TextField name="notifiedOn" label="Notified on" type="date" max={today} initial={change?.notifiedOn ?? ""} {...f} />
        <TextArea
          name="notifiedHow"
          label="How, and any reference"
          rows={2}
          placeholder="e.g. Letter emailed to the ODPC on 4 November; acknowledged, reference ODPC/REG/1234."
          hint="Keep a copy of the letter. The Data Commissioner can ask for documents to support the change."
          initial={change?.notifiedHow}
          {...f}
        />
        <TextArea name="notes" label="Notes" rows={3} initial={change?.notes} {...f} />
      </Card>

      <SubmitButton>{change ? "Save changes" : "Log change"}</SubmitButton>
    </form>
  );
}
