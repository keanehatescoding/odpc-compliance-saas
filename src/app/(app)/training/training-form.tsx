"use client";

import { useActionState } from "react";
import { saveTraining } from "@/app/actions/training";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormMessage, SelectField, TextArea, TextField } from "@/components/ui";
import type { TrainingSession } from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { REFRESHER_MONTHS } from "@/lib/training";

export function TrainingForm({
  session,
  sessions,
  refreshes,
}: {
  /** The session being edited. */
  session?: TrainingSession;
  /** The organisation's sessions, to choose the one this refreshes from. */
  sessions: TrainingSession[];
  /** For a new session, the earlier one it's the refresher for. */
  refreshes?: TrainingSession;
}) {
  const [state, action] = useActionState(saveTraining, undefined);
  const f = { errors: state?.errors, values: state?.values };
  const from = session ?? refreshes;
  const earlier = Object.fromEntries(
    sessions.filter((s) => s.id !== session?.id).map((s) => [s.id, `${s.title}, held ${formatDate(s.heldOn)}`]),
  );

  return (
    <form action={action} className="max-w-3xl space-y-6">
      {session && <input type="hidden" name="id" value={session.id} />}
      <FormMessage message={state?.message} />
      {state?.errors && <FormMessage message="Some fields need attention. See the messages below." />}

      <Card className="space-y-5">
        <h2 className="font-semibold">The session</h2>
        <TextField name="title" label="Title" placeholder="e.g. Data protection induction for new staff" initial={from?.title} {...f} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="heldOn" label="Held on" type="date" initial={session?.heldOn ?? ""} {...f} />
          <TextField
            name="provider"
            label="Who ran it"
            placeholder="e.g. The deputy head; a law firm; the ODPC"
            initial={from?.provider}
            {...f}
          />
        </div>
        <TextArea
          name="topics"
          label="What it covered"
          rows={4}
          hint="The topics, in enough detail that someone who wasn't there can tell what staff were told."
          initial={from?.topics}
          {...f}
        />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">Who attended</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="audience" label="Who it was for" placeholder="e.g. All teaching staff; the accounts office" initial={from?.audience} {...f} />
          <TextField
            name="attendeeCount"
            label="How many attended"
            inputMode="numeric"
            hint="Leave blank if nobody counted."
            initial={session?.attendeeCount?.toString() ?? ""}
            {...f}
          />
        </div>
        <TextField
          name="evidence"
          label="Where the attendance record is kept"
          placeholder="e.g. Signed register in the HR file; certificates in the shared drive, Training/2026"
          hint="Kinga records the count, not the names. Keep the register itself where you can produce it."
          initial={session?.evidence}
          {...f}
        />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">Refreshers</h2>
        <TextField
          name="refresherOn"
          label="Refresher due on"
          type="date"
          hint={`When these people should be trained again. ${REFRESHER_MONTHS} months after the session is a common choice.`}
          initial={session?.refresherOn ?? ""}
          {...f}
        />
        {Object.keys(earlier).length > 0 && (
          <SelectField
            name="refreshesId"
            label="This was the refresher for"
            placeholder="Not a refresher"
            options={earlier}
            hint="Choosing an earlier session marks its refresher as held."
            initial={(session ? session.refreshesId : refreshes?.id) ?? ""}
            {...f}
          />
        )}
        <TextArea name="notes" label="Notes" rows={3} initial={session?.notes} {...f} />
      </Card>

      <SubmitButton>{session ? "Save changes" : "Record session"}</SubmitButton>
    </form>
  );
}
