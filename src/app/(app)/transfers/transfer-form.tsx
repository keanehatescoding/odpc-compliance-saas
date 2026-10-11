"use client";

import { useActionState } from "react";
import { saveTransfer } from "@/app/actions/transfer";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormMessage, SelectField, TextArea, TextField } from "@/components/ui";
import type { Transfer } from "@/db/schema";
import { TRANSFER_BASES } from "@/lib/transfer";

export function TransferForm({
  transfer,
  activities,
  activity,
}: {
  transfer?: Transfer;
  activities: { id: string; name: string }[];
  /** The activity to start a new transfer on, with the countries its RoPA entry names. */
  activity?: { id: string; countries: string };
}) {
  const [state, action] = useActionState(saveTransfer, undefined);
  const f = { errors: state?.errors, values: state?.values };

  return (
    <form action={action} className="max-w-3xl space-y-6">
      {transfer && <input type="hidden" name="id" value={transfer.id} />}
      <FormMessage message={state?.message} />
      {state?.errors && <FormMessage message="Some fields need attention. See the messages below." />}

      <Card className="space-y-5">
        <h2 className="font-semibold">Where the data goes</h2>
        <SelectField
          name="activityId"
          label="Processing activity"
          options={Object.fromEntries(activities.map((a) => [a.id, a.name]))}
          placeholder="Choose an activity"
          hint="From your Records of processing. Its entry should say data is transferred outside Kenya."
          initial={transfer ? (transfer.activityId ?? "") : (activity?.id ?? "")}
          {...f}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            name="recipient"
            label="Who receives it"
            placeholder="e.g. Mailchimp (Intuit Inc.)"
            hint="A supplier, a parent company, a partner. One record for each."
            initial={transfer?.recipient}
            {...f}
          />
          <TextField
            name="countries"
            label="Countries"
            placeholder="e.g. United States"
            hint="Where they store it, and where their staff reach it from."
            initial={transfer?.countries ?? activity?.countries}
            {...f}
          />
        </div>
        <TextArea
          name="dataSent"
          label="What personal data is sent"
          rows={2}
          placeholder="e.g. Parents' names, email addresses and which class their child is in."
          hint="Only what the recipient needs."
          initial={transfer?.dataSent}
          {...f}
        />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">What makes it lawful</h2>
        <SelectField
          name="basis"
          label="What the transfer relies on"
          options={TRANSFER_BASES}
          hint="Section 48 of the Act. Consent is for when none of the others applies, and people must be told the risks first."
          initial={transfer?.basis ?? "pending"}
          {...f}
        />
        <TextArea
          name="basisDetail"
          label="What that rests on"
          rows={4}
          placeholder="e.g. The supplier's data processing addendum, signed 3 March 2026, with standard contractual clauses: it uses the data only on our instructions, encrypts it, names its sub-processors and tells us of a breach within 48 hours."
          hint="The country's law and how you checked it, the clauses that bind the recipient, the reason the transfer is necessary, or how people are asked to consent."
          initial={transfer?.basisDetail}
          {...f}
        />
        <TextArea
          name="subjectConsent"
          label="Consent for sensitive personal data"
          rows={2}
          placeholder="e.g. The admission form asks parents to agree to health records being stored on the system's servers in Ireland."
          hint="Section 49 lets sensitive data, such as health or biometric details, leave Kenya only with the person's consent. Leave blank if none is sent."
          initial={transfer?.subjectConsent}
          {...f}
        />
        <TextField
          name="evidence"
          label="Where the proof is kept"
          placeholder="e.g. Contracts folder on the shared drive, “Mailchimp DPA 2026.pdf”"
          hint="The signed agreement or whatever else shows the basis holds. The Data Commissioner can ask to see it."
          initial={transfer?.evidence}
          {...f}
        />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">Dates</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="startedOn" label="Transfers began on" type="date" initial={transfer?.startedOn ?? ""} {...f} />
          <TextField
            name="reviewOn"
            label="Review on"
            type="date"
            hint="A year from now is usual, or sooner if the supplier or its terms change."
            initial={transfer?.reviewOn ?? ""}
            {...f}
          />
        </div>
        <TextArea name="notes" label="Notes" rows={3} initial={transfer?.notes} {...f} />
      </Card>

      <SubmitButton>{transfer ? "Save changes" : "Add transfer"}</SubmitButton>
    </form>
  );
}
