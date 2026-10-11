"use client";

import { useActionState } from "react";
import { saveLia } from "@/app/actions/lia";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormMessage, SelectField, TextArea, TextField } from "@/components/ui";
import type { InterestAssessment } from "@/db/schema";
import { LIA_OUTCOMES } from "@/lib/lia";

export function LiaForm({
  assessment,
  activities,
  activity,
}: {
  assessment?: InterestAssessment;
  activities: { id: string; name: string }[];
  /** The activity to start a new assessment on. */
  activity?: { id: string; name: string };
}) {
  const [state, action] = useActionState(saveLia, undefined);
  const f = { errors: state?.errors, values: state?.values };

  return (
    <form action={action} className="max-w-3xl space-y-6">
      {assessment && <input type="hidden" name="id" value={assessment.id} />}
      <FormMessage message={state?.message} />
      {state?.errors && <FormMessage message="Some fields need attention. See the messages below." />}

      <Card className="space-y-5">
        <h2 className="font-semibold">What is being assessed</h2>
        <SelectField
          name="activityId"
          label="Processing activity"
          options={Object.fromEntries(activities.map((a) => [a.id, a.name]))}
          placeholder="Choose an activity"
          hint="From your Records of processing. Its lawful basis should be legitimate interests."
          initial={assessment ? (assessment.activityId ?? "") : (activity?.id ?? "")}
          {...f}
        />
        <TextField
          name="name"
          label="Name of the assessment"
          placeholder="e.g. CCTV at the gate and in the corridors"
          initial={assessment?.name ?? activity?.name}
          {...f}
        />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">The interest and why you need the data</h2>
        <TextArea
          name="interest"
          label="What the interest is, and whose"
          rows={3}
          placeholder="e.g. Ours: keeping pupils, staff and school property safe, and having evidence when something happens."
          hint="Be specific. Say if it is a third party's interest, such as an insurer's or a parent company's."
          initial={assessment?.interest}
          {...f}
        />
        <TextArea
          name="necessity"
          label="Why the processing is necessary for it"
          rows={4}
          placeholder="e.g. Two break-ins last year went unsolved. We considered better lighting and a second guard; they help but leave no evidence."
          hint="What would you lose without it, and what less intrusive ways did you consider?"
          initial={assessment?.necessity}
          {...f}
        />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">The balance</h2>
        <TextArea
          name="impact"
          label="What it means for the people concerned"
          rows={4}
          placeholder="e.g. People expect cameras at a school gate. Footage could embarrass someone if it were shared, and pupils can't choose to avoid the corridors."
          hint="Would they expect it? What harm could it do them? Weigh children's and sensitive data more heavily."
          initial={assessment?.impact}
          {...f}
        />
        <TextArea
          name="safeguards"
          label="Safeguards"
          rows={3}
          placeholder="e.g. No cameras in toilets or changing rooms, no audio, footage deleted after 30 days, viewing limited to the deputy principal."
          hint="What you do to limit the effect: less data, shorter retention, fewer people with access."
          initial={assessment?.safeguards}
          {...f}
        />
        <TextArea
          name="objection"
          label="How someone objects"
          rows={2}
          placeholder="e.g. Tell the school office. The deputy principal replies within 14 days and records the reason if the cameras stay."
          hint="Section 36 of the Act lets people object. Say who they tell and what you do about it."
          initial={assessment?.objection}
          {...f}
        />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">The decision</h2>
        <SelectField
          name="outcome"
          label="Does the interest justify the processing?"
          options={LIA_OUTCOMES}
          hint="If people's rights outweigh it, stop or change the processing, or rely on another lawful basis."
          initial={assessment?.outcome ?? "pending"}
          {...f}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            name="decidedBy"
            label="Decided by"
            placeholder="e.g. The principal"
            initial={assessment?.decidedBy}
            {...f}
          />
          <TextField name="decidedOn" label="Decided on" type="date" initial={assessment?.decidedOn ?? ""} {...f} />
        </div>
        <TextField
          name="reviewOn"
          label="Review on"
          type="date"
          hint="When you'll check the balance still holds. A year from now is usual, or sooner if the processing changes."
          initial={assessment?.reviewOn ?? ""}
          {...f}
        />
        <TextArea name="notes" label="Notes" rows={3} initial={assessment?.notes} {...f} />
      </Card>

      <SubmitButton>{assessment ? "Save changes" : "Add assessment"}</SubmitButton>
    </form>
  );
}
