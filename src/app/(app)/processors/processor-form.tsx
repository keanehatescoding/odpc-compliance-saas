"use client";

import { useActionState } from "react";
import { saveProcessor } from "@/app/actions/processors";
import { SubmitButton } from "@/components/submit-button";
import { Card, CheckboxField, FormMessage, TextArea, TextField } from "@/components/ui";
import type { Processor } from "@/db/schema";

export function ProcessorForm({
  processor,
  activities,
  linkedActivityIds = [],
}: {
  processor?: Processor;
  activities: { id: string; name: string }[];
  linkedActivityIds?: string[];
}) {
  const [state, action] = useActionState(saveProcessor, undefined);
  const f = { errors: state?.errors, values: state?.values };
  const linked = new Set(state?.values ? [state.values.activityIds ?? []].flat() : linkedActivityIds);

  return (
    <form action={action} className="max-w-3xl space-y-6">
      {processor && <input type="hidden" name="id" value={processor.id} />}
      <FormMessage message={state?.message} />
      {state?.errors && <FormMessage message="Some fields need attention. See the messages below." />}

      <Card className="space-y-5">
        <h2 className="font-semibold">The processor</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="name" label="Name" placeholder="e.g. Your payroll bureau or bulk SMS provider" initial={processor?.name} {...f} />
          <TextField name="contact" label="Contact details" placeholder="Person, phone or email" initial={processor?.contact} {...f} />
        </div>
        <TextArea
          name="service"
          label="What they do for you"
          rows={3}
          hint="The service, and what personal data it involves."
          initial={processor?.service}
          {...f}
        />
        {activities.length > 0 && (
          <fieldset>
            <legend className="text-sm font-medium">Processing activities whose data they handle</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {activities.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="activityIds" value={a.id} defaultChecked={linked.has(a.id)} className="size-4 accent-brand-600" />
                  {a.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">Where the data goes</h2>
        <TextField
          name="location"
          label="Where they hold the data"
          placeholder="e.g. Kenya; Ireland (AWS eu-west-1)"
          initial={processor?.location}
          {...f}
        />
        <CheckboxField
          name="outsideKenya"
          label="They hold or can reach the data from outside Kenya"
          hint="That makes it a transfer outside Kenya, which the activity's RoPA entry should record with its safeguards."
          initial={processor?.outsideKenya}
          values={f.values}
        />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">Security and contract</h2>
        <TextArea
          name="guarantees"
          label="How you checked they keep the data secure"
          rows={3}
          placeholder="e.g. ODPC processor certificate seen; ISO 27001 certificate; answered our security questionnaire"
          hint="You must choose processors that give sufficient guarantees about their security measures."
          initial={processor?.guarantees}
          {...f}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            name="contractSignedOn"
            label="Written contract signed on"
            type="date"
            hint="Leave blank until one is signed."
            initial={processor?.contractSignedOn ?? ""}
            {...f}
          />
          <TextField
            name="contractReviewOn"
            label="Review the contract on"
            type="date"
            hint="When it renews or ends, or a year from now."
            initial={processor?.contractReviewOn ?? ""}
            {...f}
          />
        </div>
        <TextField
          name="contractRef"
          label="Where the contract is kept"
          placeholder="e.g. Signed DPA in the shared drive, Contracts/2026; or their online terms, accepted on signup"
          initial={processor?.contractRef}
          {...f}
        />
        <TextArea name="notes" label="Notes" rows={3} initial={processor?.notes} {...f} />
      </Card>

      <SubmitButton>{processor ? "Save changes" : "Add processor"}</SubmitButton>
    </form>
  );
}
