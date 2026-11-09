"use client";

import { useActionState, useRef, useState } from "react";
import { saveDisposal } from "@/app/actions/disposals";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormMessage, SelectField, TextArea, TextField } from "@/components/ui";
import type { Disposal } from "@/db/schema";
import { formatDate, isIsoDate } from "@/lib/dates";
import { DISPOSAL_METHODS, DISPOSAL_REASONS } from "@/lib/disposal";
import { describeRetention, nextRoundOn, retentionCutoff, roundIntervalText, type ActivityRetention } from "@/lib/retention";

export function DisposalForm({
  disposal,
  activities,
  activityId,
  today,
}: {
  disposal?: Disposal;
  activities: ActivityRetention[];
  /** The activity to start a new record on. */
  activityId?: string;
  today: string;
}) {
  const [state, action] = useActionState(saveDisposal, undefined);
  const f = { errors: state?.errors, values: state?.values };
  const formRef = useRef<HTMLFormElement>(null);
  // Followed as they change, to say where the activity's retention period draws the line.
  const [chosenId, setChosenId] = useState(disposal ? (disposal.activityId ?? "") : (activityId ?? ""));
  const [disposedOn, setDisposedOn] = useState(disposal?.disposedOn ?? "");
  const chosen = activities.find((a) => a.id === chosenId) ?? null;
  const on = isIsoDate(disposedOn) ? disposedOn : today;
  const period = chosen && describeRetention(chosen);
  const cutoff = chosen && retentionCutoff(chosen, on);
  const suggested = chosen && nextRoundOn(chosen, on);

  const applySuggested = () => {
    const input = formRef.current?.elements.namedItem("nextOn");
    if (input instanceof HTMLInputElement && suggested) input.value = suggested;
  };

  return (
    <form
      ref={formRef}
      action={action}
      className="max-w-3xl space-y-6"
      onChange={(e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement)) return;
        if (t.name === "activityId") setChosenId(t.value);
        if (t.name === "disposedOn") setDisposedOn(t.value);
      }}
    >
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
        {chosen && (
          <p className="rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-700">
            {period && cutoff ? (
              <>
                Kept for {period}. On {formatDate(on)}, that is anything from before <strong>{formatDate(cutoff)}</strong>.
              </>
            ) : (
              <>
                Kept for: {chosen.retentionPeriod}. Give the period as a length in the Records of processing and Kinga will
                show where the line falls.
              </>
            )}
          </p>
        )}
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
          hint="When more of it will have passed its retention period. Left blank, the next round follows from the activity's retention period where the Records of processing give it as a length."
          initial={disposal?.nextOn ?? ""}
          {...f}
        />
        {suggested && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-700">
            <span>
              Its retention period suggests {formatDate(suggested)}, going through it {roundIntervalText(chosen)}.
            </span>
            <button type="button" onClick={applySuggested} className="font-medium text-brand-700 hover:underline">
              Use this date
            </button>
          </p>
        )}
        <TextArea name="notes" label="Notes" rows={3} initial={disposal?.notes} {...f} />
      </Card>

      <SubmitButton>{disposal ? "Save changes" : "Record disposal"}</SubmitButton>
    </form>
  );
}
