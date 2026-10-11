"use client";

import { useActionState } from "react";
import { savePolicy } from "@/app/actions/policies";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormMessage, SelectField, TextArea, TextField } from "@/components/ui";
import type { Policy } from "@/db/schema";
import { POLICY_KINDS, type PolicyKind } from "@/lib/policy";

export function PolicyForm({
  policy,
  kind,
  today,
}: {
  policy?: Policy;
  /** The kind to start a new record on. */
  kind?: PolicyKind;
  today: string;
}) {
  const [state, action] = useActionState(savePolicy, undefined);
  const f = { errors: state?.errors, values: state?.values };

  return (
    <form action={action} className="max-w-3xl space-y-6">
      {policy && <input type="hidden" name="id" value={policy.id} />}
      <FormMessage message={state?.message} />
      {state?.errors && <FormMessage message="Some fields need attention. See the messages below." />}

      <Card className="space-y-5">
        <h2 className="font-semibold">The document</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            name="kind"
            label="Kind of document"
            options={POLICY_KINDS}
            placeholder="Choose one"
            initial={policy?.kind ?? kind}
            {...f}
          />
          <TextField name="version" label="Version" placeholder="e.g. 2.1" initial={policy?.version} {...f} />
        </div>
        <TextField
          name="title"
          label="Title"
          placeholder="e.g. Data Protection Policy; CCTV Policy; Staff Privacy Procedure"
          hint="As it appears on the document."
          initial={policy?.title ?? (kind && kind !== "other" ? POLICY_KINDS[kind] : undefined)}
          {...f}
        />
        <TextArea
          name="location"
          label="Where it is kept"
          rows={2}
          placeholder="e.g. Shared drive, Policies folder; staff handbook, section 6; published on the website"
          hint="Kinga records where the document is and doesn't hold it."
          initial={policy?.location}
          {...f}
        />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">Approval and review</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            name="owner"
            label="Who is responsible for it"
            placeholder="e.g. The data protection officer"
            initial={policy?.owner}
            {...f}
          />
          <TextField
            name="approvedBy"
            label="Approved by"
            placeholder="e.g. The board of management"
            initial={policy?.approvedBy}
            {...f}
          />
          <TextField
            name="approvedOn"
            label="Approved on"
            type="date"
            max={today}
            hint="Leave blank while it is still a draft."
            initial={policy?.approvedOn ?? ""}
            {...f}
          />
          <TextField
            name="reviewOn"
            label="Review it on"
            type="date"
            hint="A year after approval is common. Review sooner if what you do with personal data changes."
            initial={policy?.reviewOn ?? ""}
            {...f}
          />
        </div>
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">Telling staff</h2>
        <TextArea
          name="communicated"
          label="How staff were told about it"
          rows={2}
          placeholder="e.g. Covered at the January staff meeting; signed for in each contract; emailed to all staff"
          initial={policy?.communicated}
          {...f}
        />
        <TextArea name="notes" label="Notes" rows={3} initial={policy?.notes} {...f} />
      </Card>

      <SubmitButton>{policy ? "Save changes" : "Add policy"}</SubmitButton>
    </form>
  );
}
