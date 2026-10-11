"use client";

import { useActionState } from "react";
import { saveConsent } from "@/app/actions/consents";
import { SubmitButton } from "@/components/submit-button";
import { Card, CheckboxField, FormMessage, SelectField, TextArea, TextField } from "@/components/ui";
import type { ConsentRecord } from "@/db/schema";
import { CONSENT_METHODS } from "@/lib/consent";

export function ConsentForm({
  consent,
  activities,
  activityId,
}: {
  consent?: ConsentRecord;
  activities: { id: string; name: string }[];
  /** The activity to start a new record on. */
  activityId?: string;
}) {
  const [state, action] = useActionState(saveConsent, undefined);
  const f = { errors: state?.errors, values: state?.values };

  return (
    <form action={action} className="max-w-3xl space-y-6">
      {consent && <input type="hidden" name="id" value={consent.id} />}
      <FormMessage message={state?.message} />
      {state?.errors && <FormMessage message="Some fields need attention. See the messages below." />}

      <Card className="space-y-5">
        <h2 className="font-semibold">What people agree to</h2>
        <TextField
          name="name"
          label="What you ask consent for"
          placeholder="e.g. Marketing SMS to customers; pupil photographs on the school website"
          hint="One purpose per record. If you ask for two things, add two records."
          initial={consent?.name}
          {...f}
        />
        <SelectField
          name="activityId"
          label="Processing activity that relies on it"
          options={Object.fromEntries(activities.map((a) => [a.id, a.name]))}
          placeholder="Choose an activity"
          hint="From your Records of processing. Its lawful basis should be consent."
          initial={consent ? (consent.activityId ?? "") : (activityId ?? "")}
          {...f}
        />
        <TextArea
          name="wording"
          label="The exact wording"
          rows={4}
          placeholder="e.g. I agree to receive offers from Mama Njeri's Shop by SMS. I can stop them at any time by replying STOP."
          hint="Copy it from the form, screen or script. Plain words, separate from your other terms, and no pre-ticked boxes."
          initial={consent?.wording}
          {...f}
        />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">How it&apos;s given and proved</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            name="method"
            label="How people give it"
            options={CONSENT_METHODS}
            placeholder="Choose one"
            initial={consent?.method}
            {...f}
          />
          <TextField
            name="collection"
            label="Where and when you ask"
            placeholder="e.g. On the admission form, at enrolment"
            initial={consent?.collection}
            {...f}
          />
        </div>
        <TextArea
          name="evidence"
          label="Where the proof is kept"
          rows={2}
          placeholder="e.g. Signed forms in each pupil's file; opt-in log exported monthly from the SMS platform"
          hint="If someone says they never agreed, this is where you look. It should show who agreed, when, and to which wording."
          initial={consent?.evidence}
          {...f}
        />
        <TextArea
          name="withdrawal"
          label="How someone withdraws"
          rows={2}
          placeholder="e.g. Reply STOP to any message, or tell the front office. We remove the number within two working days."
          hint="It should be as easy as agreeing was. Say what you do once they have."
          initial={consent?.withdrawal}
          {...f}
        />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">Children and choice</h2>
        <CheckboxField
          name="parental"
          label="A parent or guardian gives it for a child"
          hint="Section 33 of the Act requires this before you process the personal data of anyone under 18."
          initial={consent?.parental}
          values={f.values}
        />
        <TextField
          name="guardianCheck"
          label="How you check they are the parent or guardian"
          placeholder="e.g. Signature matched to the guardian named on the admission record"
          hint="Only needed when a parent or guardian gives the consent."
          initial={consent?.guardianCheck}
          {...f}
        />
        <CheckboxField
          name="conditional"
          label="People who don't agree are refused the service"
          hint="Consent isn't freely given if a service depends on agreeing to something it doesn't need."
          initial={consent?.conditional}
          values={f.values}
        />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">Keeping it current</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            name="inUseFrom"
            label="This wording in use from"
            type="date"
            hint="Leave blank if you don't know."
            initial={consent?.inUseFrom ?? ""}
            {...f}
          />
          <TextField
            name="reviewOn"
            label="Review on"
            type="date"
            hint="When you'll check the wording still matches what you do. A year from now is usual."
            initial={consent?.reviewOn ?? ""}
            {...f}
          />
        </div>
        <TextArea name="notes" label="Notes" rows={3} initial={consent?.notes} {...f} />
      </Card>

      <SubmitButton>{consent ? "Save changes" : "Add consent record"}</SubmitButton>
    </form>
  );
}
