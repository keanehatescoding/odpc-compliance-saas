"use client";

import { useActionState } from "react";
import { saveActivity } from "@/app/actions/ropa";
import { SubmitButton } from "@/components/submit-button";
import { Card, CheckboxField, FormMessage, SelectField, TextArea, TextField } from "@/components/ui";
import type { ProcessingActivity } from "@/db/schema";
import { LAWFUL_BASES, SENSITIVE_CATEGORIES } from "@/lib/dpa";

export function ActivityForm({ activity }: { activity?: ProcessingActivity }) {
  const [state, action] = useActionState(saveActivity, undefined);
  const f = { errors: state?.errors, values: state?.values };

  const submittedSensitive = state?.values ? [state.values.sensitiveCategories ?? []].flat() : null;
  const sensitive = new Set(submittedSensitive ?? activity?.sensitiveCategories ?? []);

  return (
    <form action={action} className="max-w-3xl space-y-6">
      {activity && <input type="hidden" name="id" value={activity.id} />}
      <FormMessage message={state?.message} />
      {state?.errors && <FormMessage message="Some fields need attention. See the messages below." />}

      <Card className="space-y-5">
        <h2 className="font-semibold">What and why</h2>
        <TextField name="name" label="Activity name" placeholder="e.g. Staff payroll" initial={activity?.name} {...f} />
        <TextArea name="purpose" label="Purpose of processing" initial={activity?.purpose} {...f} />
        <SelectField
          name="lawfulBasis"
          label="Lawful basis (s.30)"
          options={LAWFUL_BASES}
          placeholder="Choose a lawful basis"
          initial={activity?.lawfulBasis}
          {...f}
        />
        <TextField name="owner" label="Responsible person or team" initial={activity?.owner} {...f} />
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">Whose data, and what data</h2>
        <TextArea
          name="dataSubjects"
          label="Categories of data subjects"
          hint="Separate with commas or new lines, e.g. Employees, Job applicants"
          initial={activity?.dataSubjects.join(", ")}
          {...f}
        />
        <TextArea
          name="dataCategories"
          label="Categories of personal data"
          hint="e.g. Name, National ID number, Phone number"
          initial={activity?.dataCategories.join(", ")}
          {...f}
        />
        <fieldset>
          <legend className="text-sm font-medium text-stone-800">Sensitive personal data involved</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {SENSITIVE_CATEGORIES.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="sensitiveCategories"
                  value={c}
                  defaultChecked={sensitive.has(c)}
                  className="size-4 accent-brand-600"
                />
                {c}
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      {/* The transfer fields are shown by CSS, so they also work before JS loads. */}
      <Card className="group space-y-5">
        <h2 className="font-semibold">Sharing and transfers</h2>
        <TextArea name="recipients" label="Recipients" hint="Who receives this data: regulators, service providers, partners." initial={activity?.recipients} {...f} />
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="crossBorder"
            defaultChecked={state?.values ? state.values.crossBorder === "on" : Boolean(activity?.crossBorder)}
            className="mt-0.5 size-4 accent-brand-600"
          />
          <span>
            <span className="font-medium text-stone-800">Data is transferred outside Kenya</span>
            <span className="block text-xs text-stone-500">Includes cloud services hosted abroad (e.g. Google Workspace, Microsoft 365).</span>
          </span>
        </label>
        <div className="hidden gap-5 group-has-[[name=crossBorder]:checked]:grid sm:grid-cols-2">
          <TextField name="transferCountries" label="Countries" initial={activity?.transferCountries} {...f} />
          <TextField
            name="transferSafeguards"
            label="Safeguards"
            hint="e.g. contractual clauses, adequacy, consent"
            initial={activity?.transferSafeguards}
            {...f}
          />
        </div>
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">Retention and security</h2>
        <TextField name="retentionPeriod" label="Retention period" placeholder="e.g. 7 years after employment ends" initial={activity?.retentionPeriod} {...f} />
        <TextArea name="securityMeasures" label="Security measures" initial={activity?.securityMeasures} {...f} />
        <TextField name="systems" label="Systems / storage location" initial={activity?.systems} {...f} />
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Risk screening</h2>
        <p className="text-sm text-stone-600">Used to flag activities that may need a Data Protection Impact Assessment.</p>
        <CheckboxField
          name="systematicMonitoring"
          label="Systematic monitoring"
          hint="CCTV, location tracking, behavioural profiling, credit scoring"
          initial={activity?.systematicMonitoring}
          values={f.values}
        />
        <CheckboxField
          name="largeScale"
          label="Large scale"
          hint="A large number of people, or a large share of your customers or community"
          initial={activity?.largeScale}
          values={f.values}
        />
        <CheckboxField name="involvesChildren" label="Involves children's data" initial={activity?.involvesChildren} values={f.values} />
      </Card>

      <SubmitButton>{activity ? "Save changes" : "Add activity"}</SubmitButton>
    </form>
  );
}
