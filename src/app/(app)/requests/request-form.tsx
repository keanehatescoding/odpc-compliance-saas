"use client";

import { useActionState } from "react";
import { saveSubjectRequest } from "@/app/actions/subject-requests";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormMessage, SelectField, TextArea, TextField } from "@/components/ui";
import type { SubjectRequest } from "@/db/schema";
import { REQUEST_KIND_KEYS, REQUEST_KINDS, REQUEST_OUTCOMES } from "@/lib/subject-request";

const KIND_OPTIONS = Object.fromEntries(REQUEST_KIND_KEYS.map((k) => [k, `${REQUEST_KINDS[k].label} (${REQUEST_KINDS[k].days} days)`]));

export function RequestForm({ request, defaults }: { request?: SubjectRequest; defaults?: { receivedOn: string } }) {
  const [state, action] = useActionState(saveSubjectRequest, undefined);
  const f = { errors: state?.errors, values: state?.values };

  return (
    <form action={action} className="max-w-3xl space-y-6">
      {request && <input type="hidden" name="id" value={request.id} />}
      <FormMessage message={state?.message} />
      {state?.errors && <FormMessage message="Some fields need attention. See the messages below." />}

      <Card className="space-y-5">
        <h2 className="font-semibold">The request</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            name="kind"
            label="What they asked for"
            options={KIND_OPTIONS}
            placeholder="Choose one"
            hint="The days to respond are set by the Data Protection (General) Regulations."
            initial={request?.kind}
            {...f}
          />
          <TextField
            name="receivedOn"
            label="Received on"
            type="date"
            hint="The deadline counts from this day."
            initial={request ? request.receivedOn : defaults?.receivedOn}
            {...f}
          />
        </div>
        <TextArea
          name="details"
          label="Details"
          rows={4}
          hint="What they asked for, in their words where possible, and which records it concerns."
          initial={request?.details}
          {...f}
        />
        <TextField name="channel" label="How it arrived" placeholder="e.g. Email to info@, letter, at reception" initial={request?.channel} {...f} />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">Who asked</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="requesterName" label="Data subject" initial={request?.requesterName} {...f} />
          <TextField name="requesterContact" label="Contact details" placeholder="Phone or email" initial={request?.requesterContact} {...f} />
        </div>
        <TextField
          name="representative"
          label="Made on their behalf by (if anyone)"
          placeholder="e.g. Parent, guardian, advocate"
          hint="Check they are authorised to act for the data subject before you respond."
          initial={request?.representative}
          {...f}
        />
        <TextField
          name="identityCheck"
          label="How you confirmed who they are"
          placeholder="e.g. Checked national ID at reception"
          hint="Don't hand over or change personal data until you're sure who is asking."
          initial={request?.identityCheck}
          {...f}
        />
      </Card>

      {request && (
        <Card className="space-y-5">
          <h2 className="font-semibold">Your response</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              name="outcome"
              label="Outcome"
              options={REQUEST_OUTCOMES}
              placeholder="Not yet responded"
              initial={request.outcome ?? ""}
              {...f}
            />
            <TextField name="respondedOn" label="Responded on" type="date" initial={request.respondedOn ?? ""} {...f} />
          </div>
          <TextArea
            name="response"
            label="What you did, or why you declined"
            rows={4}
            hint="If you decline, you must give the person your reasons in writing."
            initial={request.response}
            {...f}
          />
        </Card>
      )}

      <SubmitButton>{request ? "Save changes" : "Log request"}</SubmitButton>
    </form>
  );
}
