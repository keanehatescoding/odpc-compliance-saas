"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateOrganization } from "@/app/actions/settings";
import { ParticularsPrompt } from "@/components/particulars-prompt";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormMessage, SelectField, TextArea, TextField } from "@/components/ui";
import type { Organization } from "@/db/schema";
import { ORG_SIZES, SECTORS } from "@/lib/dpa";
import { DPO_CHECKLIST, dpoIssues, dpoTodo } from "@/lib/dpo";

/** The organisation's settings, with its data protection officer and what that record still needs; read-only for members. */
export function SettingsForm({ org, canEdit, ownerEmails }: { org: Organization; canEdit: boolean; ownerEmails: string[] }) {
  const [state, action] = useActionState(updateOrganization, undefined);
  const f = { errors: state?.errors, values: state?.values };
  const issues = dpoIssues(org);
  return (
    <Card className="max-w-2xl">
      <form action={action} className="space-y-5">
        <FormMessage message={state?.message} tone={state?.message === "Saved." ? "success" : "error"} />
        {state?.particulars && <ParticularsPrompt change={state.particulars} />}
        <fieldset disabled={!canEdit} className="space-y-5">
          <TextField name="name" label="Organisation name" initial={org.name} {...f} />
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField name="sector" label="Sector" options={SECTORS} initial={org.sector} {...f} />
            <SelectField name="size" label="Size" options={ORG_SIZES} initial={org.size} {...f} />
          </div>
          <TextField name="kraPin" label="KRA PIN" placeholder="P051234567X" initial={org.kraPin ?? ""} {...f} />
          <TextField
            name="reminderEmail"
            label="Send renewal reminders to"
            placeholder={ownerEmails.join(", ")}
            hint={`Comma-separated. Leave blank to send to account owners (${ownerEmails.join(", ")}).`}
            initial={org.reminderEmail ?? ""}
            {...f}
          />
          <div className="space-y-5 border-t border-stone-200 pt-5">
            <div>
              <h2 className="text-sm font-semibold text-stone-900">Privacy contact</h2>
              <p className="mt-1 text-xs text-stone-500">
                How people reach you about their personal data. These go in your <Link href="/ropa/notice" className="underline">privacy notice</Link>.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField name="privacyContact" label="Contact person or role" placeholder="Data Protection Officer" initial={org.privacyContact ?? ""} {...f} />
              <TextField name="privacyEmail" label="Email" type="email" placeholder="privacy@example.co.ke" initial={org.privacyEmail ?? ""} {...f} />
            </div>
            <TextField name="privacyPhone" label="Phone" placeholder="+254 700 000 000" initial={org.privacyPhone ?? ""} {...f} />
            <TextArea name="address" label="Physical or postal address" initial={org.address ?? ""} {...f} />
          </div>
          <div id="dpo" className="scroll-mt-6 space-y-5 border-t border-stone-200 pt-5">
            <div>
              <h2 className="text-sm font-semibold text-stone-900">Data protection officer</h2>
              <p className="mt-1 text-xs text-stone-500">
                Section 24 of the Act lets you designate one. If you do, their contact details go on your website and in your privacy notice, and are sent to
                the Data Commissioner.
              </p>
            </div>
            {issues.length > 0 && (
              <ul className="list-disc space-y-1 rounded-md bg-amber-50 py-2 pr-3 pl-7 text-sm text-amber-900">
                {issues.map((i) => (
                  <li key={i.kind}>{dpoTodo(i)}.</li>
                ))}
              </ul>
            )}
            <SelectField
              name="dpoDesignated"
              label="Do you have a data protection officer?"
              options={{ yes: "Yes", no: "No" }}
              placeholder="Not answered yet"
              initial={org.dpoDesignated === null ? "" : org.dpoDesignated ? "yes" : "no"}
              {...f}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField name="dpoName" label="Name" hint="A person, or the firm you appoint." initial={org.dpoName ?? ""} {...f} />
              <TextField name="dpoEmail" label="Email" type="email" placeholder="dpo@example.co.ke" initial={org.dpoEmail ?? ""} {...f} />
            </div>
            <TextField name="dpoPhone" label="Phone" initial={org.dpoPhone ?? ""} {...f} />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField name="dpoAppointedOn" label="Appointed on" type="date" initial={org.dpoAppointedOn ?? ""} {...f} />
              <TextField
                name="dpoNotifiedOn"
                label="Details sent to the Data Commissioner on"
                type="date"
                hint="Update this each time you send new details."
                initial={org.dpoNotifiedOn ?? ""}
                {...f}
              />
            </div>
            <details className="text-sm text-stone-700">
              <summary className="cursor-pointer font-medium text-stone-800">What section 24 asks of a data protection officer</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {DPO_CHECKLIST.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          </div>
        </fieldset>
        {canEdit ? <SubmitButton>Save settings</SubmitButton> : <p className="text-sm text-stone-600">Only owners and admins can change these settings.</p>}
      </form>
    </Card>
  );
}
