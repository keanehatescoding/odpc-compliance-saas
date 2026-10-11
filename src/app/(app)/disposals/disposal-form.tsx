"use client";

import { useActionState } from "react";
import { saveDisposal } from "@/app/actions/disposals";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormMessage, SelectField, TextArea, TextField } from "@/components/ui";
import type { Disposal } from "@/db/schema";
import { DISPOSAL_METHODS, DISPOSAL_REASONS } from "@/lib/disposal";

export function DisposalForm({
  disposal,
  activities,
  activityId,
  today,
}: {
  disposal?: Disposal;
  activities: { id: string; name: string }[];
  /** The activity to start a new record on. */
  activityId?: string;
  today: string;
}) {
  const [state, action] = useActionState(saveDisposal, undefined);
  const f = { errors: state?.errors, values: state?.values };

  return (
    <form action={action} className="max-w-3xl space-y-6">
      {disposal && <input type="hidden" name="id" value={disposal.id} />}
      <FormMessage message={state?.message} />
      {state?.errors && <FormMessage message="Some fields need attention. See the messages below." />}

      <Card className="space-y-5">
        <h2 className="font-semibold">What went</h2>
        <TextField
          name="description"
          label="What was disposed of"
          placeholder="e.g. Admission files of pupils who left before 2019; CCTV footage older than 30 days"
          hint="Describe the records, not the people in them. Leave out names and ID numbers."
          initial={disposal?.description}
          {...f}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            name="activityId"
            label="Processing activity it belonged to"
            options={Object.fromEntries(activities.map((a) => [a.id, a.name]))}
            placeholder="None"
            hint="From your Records of processing, which say how long it is kept."
            initial={disposal ? (disposal.activityId ?? "") : (activityId ?? "")}
            {...f}
          />
          <TextField
            name="recordCount"
            label="Roughly how many records"
            inputMode="numeric"
            placeholder="e.g. 240"
            hint="People, files or accounts. An estimate is fine."
            initial={disposal?.recordCount?.toString() ?? ""}
            {...f}
          />
        </div>
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">When, why and how</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="disposedOn" label="Disposed of on" type="date" max={today} initial={disposal?.disposedOn ?? ""} {...f} />
          <SelectField name="reason" label="Why" options={DISPOSAL_REASONS} placeholder="Choose one" initial={disposal?.reason} {...f} />
        </div>
        <SelectField
          name="method"
          label="How"
          options={DISPOSAL_METHODS}
          placeholder="Choose one"
          hint="If more than one applies, choose the main one and explain in the notes."
          initial={disposal?.method}
          {...f}
        />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">Who did it and the proof</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            name="authorisedBy"
            label="Authorised by"
            placeholder="e.g. The head teacher"
            initial={disposal?.authorisedBy}
            {...f}
          />
          <TextField
            name="carriedOutBy"
            label="Carried out by"
            placeholder="e.g. The school bursar; a shredding company"
            initial={disposal?.carriedOutBy}
            {...f}
          />
        </div>
        <TextArea
          name="evidence"
          label="Where the proof is kept"
          rows={2}
          placeholder="e.g. Destruction certificate in the compliance file; deletion log exported from the school system"
          hint="A destruction certificate, a deletion log or a signed note. Keep the proof, not a copy of the data."
          initial={disposal?.evidence}
          {...f}
        />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">The next round</h2>
        <TextField
          name="nextOn"
          label="Go through this data again on"
          type="date"
          hint="When more of it will have passed its retention period. Leave blank if this was a one-off."
          initial={disposal?.nextOn ?? ""}
          {...f}
        />
        <TextArea name="notes" label="Notes" rows={3} initial={disposal?.notes} {...f} />
      </Card>

      <SubmitButton>{disposal ? "Save changes" : "Record disposal"}</SubmitButton>
    </form>
  );
}
