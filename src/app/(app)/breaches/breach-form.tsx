"use client";

import { useActionState } from "react";
import { saveBreach } from "@/app/actions/breaches";
import { SubmitButton } from "@/components/submit-button";
import { Card, CheckboxField, FormMessage, SelectField, TextArea, TextField } from "@/components/ui";
import type { Breach } from "@/db/schema";
import { BREACH_KINDS, BREACH_RISKS } from "@/lib/breach";
import { toKenyaDateTimeLocal } from "@/lib/dates";
import { REGISTRATION_ROLES, SENSITIVE_CATEGORIES } from "@/lib/dpa";

const local = (d: Date | null | undefined) => (d ? toKenyaDateTimeLocal(d) : "");

export function BreachForm({
  breach,
  activities,
  linkedActivityIds = [],
  defaults,
}: {
  breach?: Breach;
  activities: { id: string; name: string }[];
  linkedActivityIds?: string[];
  /** Prefills for a new breach: the current time and the reporter's contact details. */
  defaults?: { discoveredAt: string; contactPerson: string };
}) {
  const [state, action] = useActionState(saveBreach, undefined);
  const f = { errors: state?.errors, values: state?.values };

  const pick = (name: string, saved: string[]) => new Set(state?.values ? [state.values[name] ?? []].flat() : saved);
  const sensitive = pick("sensitiveCategories", breach?.sensitiveCategories ?? []);
  const linked = pick("activityIds", linkedActivityIds);

  return (
    <form action={action} className="max-w-3xl space-y-6">
      {breach && <input type="hidden" name="id" value={breach.id} />}
      <FormMessage message={state?.message} />
      {state?.errors && <FormMessage message="Some fields need attention. See the messages below." />}

      <Card className="space-y-5">
        <h2 className="font-semibold">What happened</h2>
        <TextField name="title" label="Short title" placeholder="e.g. Parents' list sent to wrong WhatsApp group" initial={breach?.title} {...f} />
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField name="kind" label="Type of breach" options={BREACH_KINDS} placeholder="Choose one" initial={breach?.kind} {...f} />
          <SelectField
            name="role"
            label="For this data, you are the"
            options={REGISTRATION_ROLES}
            initial={breach?.role ?? "controller"}
            hint="Processors notify their controller within 48 hours; controllers notify the ODPC within 72."
            {...f}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            name="discoveredAt"
            label="When you became aware"
            type="datetime-local"
            hint="Nairobi time. The notification clock starts here."
            initial={breach ? local(breach.discoveredAt) : defaults?.discoveredAt}
            {...f}
          />
          <TextField
            name="occurredAt"
            label="When it happened (if known)"
            type="datetime-local"
            initial={local(breach?.occurredAt)}
            {...f}
          />
        </div>
        <TextArea name="description" label="Description" rows={4} hint="What happened, how it was found, and what is known so far." initial={breach?.description} {...f} />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">People and data affected</h2>
        <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
          <TextField name="dataSubjects" label="Who is affected" placeholder="e.g. Parents, Students" initial={breach?.dataSubjects} {...f} />
          <TextField
            name="approxSubjects"
            label="Approx. number"
            inputMode="numeric"
            hint="Leave blank if unknown."
            initial={breach?.approxSubjects?.toString() ?? ""}
            {...f}
          />
        </div>
        <TextArea name="dataCategories" label="Personal data involved" hint="e.g. Names, phone numbers, fee balances" initial={breach?.dataCategories} {...f} />
        <fieldset>
          <legend className="text-sm font-medium text-stone-800">Sensitive personal data involved</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {SENSITIVE_CATEGORIES.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="sensitiveCategories" value={c} defaultChecked={sensitive.has(c)} className="size-4 accent-brand-600" />
                {c}
              </label>
            ))}
          </div>
        </fieldset>
        {activities.length > 0 && (
          <fieldset>
            <legend className="text-sm font-medium text-stone-800">Processing activities affected</legend>
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
        <CheckboxField
          name="dataUnintelligible"
          label="The data was encrypted or otherwise unreadable to whoever got it"
          hint="If so, you may not need to tell affected people directly."
          initial={breach?.dataUnintelligible}
          values={f.values}
        />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">Risk assessment</h2>
        <SelectField
          name="risk"
          label="Risk of harm to the people affected"
          options={BREACH_RISKS}
          initial={breach?.risk ?? "unassessed"}
          hint="Consider identity theft, fraud, financial loss, discrimination, distress, and whether sensitive or children's data is involved."
          {...f}
        />
        <TextArea name="riskNotes" label="Likely consequences and your reasoning" rows={4} initial={breach?.riskNotes} {...f} />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">Response</h2>
        <TextArea name="measures" label="Measures taken or proposed" hint="Containment, recovery, and steps to stop it happening again." initial={breach?.measures} {...f} />
        <TextArea name="subjectAdvice" label="What affected people should do" hint="e.g. watch for phishing SMS, change passwords, contact their bank." initial={breach?.subjectAdvice} {...f} />
        <TextField name="unauthorisedParty" label="Who got the data (if known)" initial={breach?.unauthorisedParty} {...f} />
        <TextField
          name="contactPerson"
          label="Contact person for this breach"
          hint="Name, role and contact details, usually your data protection officer."
          initial={breach ? breach.contactPerson : defaults?.contactPerson}
          {...f}
        />
      </Card>

      {breach && (
        <>
          <Card className="space-y-5">
            <h2 className="font-semibold">Notifications</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                name="notifiedAt"
                label={breach.role === "processor" ? "Controller notified on" : "ODPC notified on"}
                type="datetime-local"
                initial={local(breach.notifiedAt)}
                {...f}
              />
              <TextField name="notificationRef" label="Reference number" initial={breach.notificationRef} {...f} />
            </div>
            <TextArea name="delayReason" label="Reasons for any delay" hint="Required if notification was late." initial={breach.delayReason} {...f} />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField name="subjectsNotifiedAt" label="Affected people notified on" type="datetime-local" initial={local(breach.subjectsNotifiedAt)} {...f} />
              <TextField name="subjectsNotifiedHow" label="How" placeholder="e.g. SMS and email to each parent" initial={breach.subjectsNotifiedHow} {...f} />
            </div>
          </Card>

          <Card className="space-y-5">
            <h2 className="font-semibold">Close-out</h2>
            <TextField name="closedAt" label="Closed on" type="datetime-local" hint="Close the breach once it is contained and all notifications are done." initial={local(breach.closedAt)} {...f} />
            <TextArea name="lessons" label="Lessons learned" initial={breach.lessons} {...f} />
          </Card>
        </>
      )}

      <SubmitButton>{breach ? "Save changes" : "Log breach"}</SubmitButton>
    </form>
  );
}
