"use client";

import { useActionState } from "react";
import { saveComplaint } from "@/app/actions/complaints";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormMessage, SelectField, TextArea, TextField } from "@/components/ui";
import type { Complaint } from "@/db/schema";
import { COMPLAINT_KIND_LABELS, COMPLAINT_KINDS } from "@/lib/complaint";

export function ComplaintForm({ complaint, defaults }: { complaint?: Complaint; defaults?: { receivedOn: string } }) {
  const [state, action] = useActionState(saveComplaint, undefined);
  const f = { errors: state?.errors, values: state?.values };

  return (
    <form action={action} className="max-w-3xl space-y-6">
      {complaint && <input type="hidden" name="id" value={complaint.id} />}
      <FormMessage message={state?.message} />
      {state?.errors && <FormMessage message="Some fields need attention. See the messages below." />}

      <Card className="space-y-5">
        <h2 className="font-semibold">What the ODPC sent</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField name="kind" label="What it is" options={COMPLAINT_KIND_LABELS} placeholder="Choose one" initial={complaint?.kind} {...f} />
          <TextField
            name="reference"
            label="ODPC reference"
            placeholder="e.g. ODPC/CONF/1/5 VOL 1 (123)"
            hint="From the top of the letter. Quote it in your reply."
            initial={complaint?.reference}
            {...f}
          />
          <TextField
            name="receivedOn"
            label="Received on"
            type="date"
            hint="The day the letter or email reached you."
            initial={complaint ? complaint.receivedOn : defaults?.receivedOn}
            {...f}
          />
          <TextField
            name="dueOn"
            label="Act by"
            type="date"
            hint={`The date the letter gives. For a complaint, leave it empty to use ${COMPLAINT_KINDS.complaint.days} days from the day you received it.`}
            initial={complaint?.dueOn}
            {...f}
          />
        </div>
        <TextArea
          name="summary"
          label="What it is about"
          rows={4}
          hint="What the complainant says you did, or what the notice tells you to do, and which records it concerns."
          initial={complaint?.summary}
          {...f}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            name="complainant"
            label="Who complained (if the ODPC says)"
            hint="Kept on this page only. It isn't put in emails, the activity history or the compliance report."
            initial={complaint?.complainant}
            {...f}
          />
          <TextField
            name="handledBy"
            label="Who is dealing with it"
            placeholder="e.g. The data protection officer, your advocate"
            initial={complaint?.handledBy}
            {...f}
          />
        </div>
      </Card>

      {complaint && (
        <>
          <Card className="space-y-5">
            <h2 className="font-semibold">Your response</h2>
            <TextField
              name="respondedOn"
              label="Responded, complied or paid on"
              type="date"
              hint="The day your reply reached the ODPC. Keep proof that it was delivered."
              initial={complaint.respondedOn ?? ""}
              {...f}
            />
            <TextArea
              name="response"
              label="What you sent or did"
              rows={4}
              hint="A summary, and where the reply and its attachments are filed."
              initial={complaint.response}
              {...f}
            />
          </Card>

          <Card className="space-y-5">
            <h2 className="font-semibold">How it ended</h2>
            <TextField
              name="closedOn"
              label="Closed on"
              type="date"
              hint="The date of the ODPC's decision, a settlement with the complainant, or the withdrawal."
              initial={complaint.closedOn ?? ""}
              {...f}
            />
            <TextArea
              name="outcome"
              label="Outcome"
              rows={4}
              hint="What the ODPC decided or what was agreed, anything you were ordered to do or pay, and whether you have done it."
              initial={complaint.outcome}
              {...f}
            />
          </Card>
        </>
      )}

      <SubmitButton>{complaint ? "Save changes" : "Log it"}</SubmitButton>
    </form>
  );
}
