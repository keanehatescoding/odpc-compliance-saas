"use client";

import { useActionState } from "react";
import { saveDpia } from "@/app/actions/dpia";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormMessage, RiskLevelBadge, SelectField, TextArea, TextField } from "@/components/ui";
import type { Dpia, DpiaRisk } from "@/db/schema";
import { LIKELIHOODS, RISK_FIELDS, riskErrorKey, riskLevel, SEVERITIES, type RiskInput } from "@/lib/dpia";

/** Blank rows offered for adding risks. Saving drops any left empty. */
const SPARE_ROWS = 2;

const BLANK: RiskInput = {
  description: "",
  likelihood: "possible",
  severity: "significant",
  mitigation: "",
  residualLikelihood: "possible",
  residualSeverity: "significant",
};

const inputClass =
  "block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none";

export function DpiaForm({
  dpia,
  risks,
  activities,
}: {
  dpia: Dpia;
  risks: DpiaRisk[];
  activities: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(saveDpia, undefined);
  const f = { errors: state?.errors, values: state?.values };

  // After a failed submit, rebuild the rows from what was sent.
  const rows: RiskInput[] = state?.values
    ? (() => {
        const col = (k: keyof RiskInput) => [state.values![RISK_FIELDS[k]] ?? []].flat();
        return col("description").map(
          (_, i) => Object.fromEntries(Object.keys(RISK_FIELDS).map((k) => [k, col(k as keyof RiskInput)[i] ?? ""])) as unknown as RiskInput,
        );
      })()
    : [...(risks as RiskInput[]), ...Array<RiskInput>(SPARE_ROWS).fill(BLANK)];

  return (
    <form action={action} className="max-w-3xl space-y-6">
      <input type="hidden" name="id" value={dpia.id} />
      <FormMessage message={state?.message} />
      {state?.errors && <FormMessage message="Some fields need attention. See the messages below." />}

      <Card className="space-y-5">
        <h2 className="font-semibold">About this assessment</h2>
        <TextField name="title" label="Title" initial={dpia.title} {...f} />
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            name="activityId"
            label="Processing activity"
            options={Object.fromEntries(activities.map((a) => [a.id, a.name]))}
            placeholder="Not in the RoPA yet"
            initial={dpia.activityId ?? ""}
            hint="Link the RoPA entry once the processing is recorded."
            {...f}
          />
          <TextField name="assessor" label="Prepared by" initial={dpia.assessor} {...f} />
        </div>
      </Card>

      <Card className="space-y-5">
        <div>
          <h2 className="font-semibold">1. The processing</h2>
          <p className="text-sm text-stone-600">A systematic description of what you will do with the data, and why.</p>
        </div>
        <TextArea
          name="description"
          label="Description of the processing"
          rows={7}
          hint="Whose data and how many people, what data, how it is collected, where it is stored, who it is shared with, and how long it is kept."
          initial={dpia.description}
          {...f}
        />
        <TextArea
          name="purposes"
          label="Purposes and benefits"
          rows={3}
          hint="What you want to achieve, for you and for the people concerned. Include any legitimate interest you rely on."
          initial={dpia.purposes}
          {...f}
        />
      </Card>

      <Card className="space-y-5">
        <div>
          <h2 className="font-semibold">2. Necessity and proportionality</h2>
          <p className="text-sm text-stone-600">Whether you need this data, and this much of it, to achieve the purpose.</p>
        </div>
        <TextArea
          name="necessity"
          label="Assessment"
          rows={7}
          hint="Your lawful basis; why less data or a less intrusive approach would not work; how you keep data accurate and limit retention; how people are told and can exercise their rights; safeguards for processors and transfers outside Kenya."
          initial={dpia.necessity}
          {...f}
        />
        <TextArea
          name="consultation"
          label="Who you consulted"
          rows={3}
          hint="e.g. your data protection officer, IT provider, staff, or the people affected (or why you didn't consult them)."
          initial={dpia.consultation}
          {...f}
        />
      </Card>

      <Card className="space-y-5">
        <div>
          <h2 className="font-semibold">3. Risks and measures</h2>
          <p className="text-sm text-stone-600">
            Risks to the people whose data you process (not to your organisation), the measures that address them, and the
            risk that remains. Fill in a blank row to add a risk; clear a row to remove it.
          </p>
        </div>
        {f.errors?.rows?.map((e) => (
          <p key={e} className="text-xs text-red-700">
            {e}
          </p>
        ))}
        <ol className="space-y-4">
          {rows.map((r, i) => (
            <RiskRow key={i} index={i} risk={r} errors={f.errors?.[riskErrorKey(i)]} />
          ))}
        </ol>
      </Card>

      <Card className="space-y-5">
        <div>
          <h2 className="font-semibold">4. Conclusion and sign-off</h2>
          <p className="text-sm text-stone-600">
            Approve the DPIA before the processing starts. If a risk is still high after your measures, consult the ODPC first.
          </p>
        </div>
        <TextArea
          name="conclusion"
          label="Conclusion"
          rows={3}
          hint="Whether the processing can go ahead, and any conditions."
          initial={dpia.conclusion}
          {...f}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="approvedBy" label="Approved by" hint="Name and role." initial={dpia.approvedBy} {...f} />
          <TextField name="approvedOn" label="Approved on" type="date" initial={dpia.approvedOn ?? ""} {...f} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            name="reviewOn"
            label="Review by"
            type="date"
            hint="Defaults to 12 months after approval. Review sooner if the processing changes."
            initial={dpia.reviewOn ?? ""}
            {...f}
          />
          <TextField
            name="odpcConsultedOn"
            label="ODPC consulted on"
            type="date"
            hint="Only needed when high risk remains."
            initial={dpia.odpcConsultedOn ?? ""}
            {...f}
          />
        </div>
      </Card>

      <SubmitButton>Save DPIA</SubmitButton>
    </form>
  );
}

function RiskRow({ index, risk, errors }: { index: number; risk: RiskInput; errors?: string[] }) {
  const id = (k: keyof RiskInput) => `${RISK_FIELDS[k]}-${index}`;
  const blank = !risk.description && !risk.mitigation;
  return (
    <li className="rounded-md border border-stone-200 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-stone-800">{blank ? "New risk" : `Risk ${index + 1}`}</p>
        {!blank && (
          <p className="flex items-center gap-2 text-xs text-stone-600">
            Before <RiskLevelBadge level={riskLevel(risk.likelihood, risk.severity)} />
            After <RiskLevelBadge level={riskLevel(risk.residualLikelihood, risk.residualSeverity)} />
          </p>
        )}
      </div>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor={id("description")} className="block text-xs font-medium text-stone-700">
            Risk to people
          </label>
          <textarea
            id={id("description")}
            name={RISK_FIELDS.description}
            rows={2}
            defaultValue={risk.description}
            placeholder="e.g. Staff view records of patients they are not treating"
            className={inputClass}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <RiskSelect label="Likelihood" id={id("likelihood")} name={RISK_FIELDS.likelihood} options={LIKELIHOODS} value={risk.likelihood} />
          <RiskSelect label="Severity of harm" id={id("severity")} name={RISK_FIELDS.severity} options={SEVERITIES} value={risk.severity} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={id("mitigation")} className="block text-xs font-medium text-stone-700">
            Measures to reduce or remove the risk
          </label>
          <textarea id={id("mitigation")} name={RISK_FIELDS.mitigation} rows={2} defaultValue={risk.mitigation} className={inputClass} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <RiskSelect
            label="Likelihood after measures"
            id={id("residualLikelihood")}
            name={RISK_FIELDS.residualLikelihood}
            options={LIKELIHOODS}
            value={risk.residualLikelihood}
          />
          <RiskSelect
            label="Severity after measures"
            id={id("residualSeverity")}
            name={RISK_FIELDS.residualSeverity}
            options={SEVERITIES}
            value={risk.residualSeverity}
          />
        </div>
        {errors?.map((e) => (
          <p key={e} className="text-xs text-red-700">
            {e}
          </p>
        ))}
      </div>
    </li>
  );
}

function RiskSelect({
  label,
  id,
  name,
  options,
  value,
}: {
  label: string;
  id: string;
  name: string;
  options: Record<string, string>;
  value: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-stone-700">
        {label}
      </label>
      <select id={id} name={name} defaultValue={value} className={inputClass}>
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}
