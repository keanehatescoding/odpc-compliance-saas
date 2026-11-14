"use client";

import { useActionState } from "react";
import { saveActivity } from "@/app/actions/ropa";
import { SubmitButton } from "@/components/submit-button";
import { Card, CheckboxField, FormMessage, SelectField, TextArea, TextField } from "@/components/ui";
import type { ProcessingActivity } from "@/db/schema";
import { AUTOMATED_DECISION_GROUNDS } from "@/lib/automated-decision";
import { MARKETING_GROUNDS } from "@/lib/direct-marketing";
import { LAWFUL_BASES, SENSITIVE_CATEGORIES } from "@/lib/dpa";
import { INDIRECT_COLLECTION_GROUND_SECTION, INDIRECT_COLLECTION_GROUNDS, type IndirectCollectionGround } from "@/lib/indirect-collection";
import { RETENTION_UNITS } from "@/lib/retention";
import { ACTIVITY_ROLES } from "@/lib/ropa";
import { HEALTH_DATA_CONDITIONS, SENSITIVE_DATA_GROUNDS } from "@/lib/sensitive-data";

export function ActivityForm({ activity }: { activity?: ProcessingActivity }) {
  const [state, action] = useActionState(saveActivity, undefined);
  const f = { errors: state?.errors, values: state?.values };

  const submittedSensitive = state?.values ? [state.values.sensitiveCategories ?? []].flat() : null;
  const sensitive = new Set(submittedSensitive ?? activity?.sensitiveCategories ?? []);
  const submittedGrounds = state?.values ? [state.values.indirectCollectionGrounds ?? []].flat() : null;
  const grounds = new Set<string>(submittedGrounds ?? activity?.indirectCollectionGrounds ?? []);

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
        <TextArea
          name="provision"
          label="Do people have to give this data?"
          hint="Say whether it's required or optional, and what happens if they don't give it. Where you rely on consent you can leave this blank, and the privacy notice says it's their choice."
          initial={activity?.provision}
          {...f}
        />
        <SelectField
          name="role"
          label="Your role"
          hint="Your privacy notice covers only the activities you control."
          options={ACTIVITY_ROLES}
          placeholder="Choose your role"
          initial={activity ? (activity.role ?? "") : "controller"}
          {...f}
        />
        <TextField name="owner" label="Responsible person or team" initial={activity?.owner} {...f} />
      </Card>

      {/* The sensitive data fields are shown by CSS once a category is ticked, so they also work before JS loads. */}
      <Card className="group space-y-5">
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
        <div className="hidden space-y-5 group-has-[[name=sensitiveCategories]:checked]:block">
          <SelectField
            name="sensitiveDataGround"
            label="What allows you to process the sensitive data (s.45)"
            hint="The Act lists no consent ground for sensitive data, so if you rely on people's consent, check with counsel which of these applies. A processor can leave this to the controller it works for."
            options={SENSITIVE_DATA_GROUNDS}
            placeholder="Not decided yet"
            initial={activity?.sensitiveDataGround ?? ""}
            {...f}
          />
          <TextArea
            name="sensitiveDataBasis"
            label="What the ground rests on"
            hint="The law that sets the obligation or gives the right, the claim, or where the person made the data public."
            initial={activity?.sensitiveDataBasis}
            {...f}
          />
          <div className="hidden group-has-[[name=sensitiveCategories][value='Health_status']:checked]:block">
            <SelectField
              name="healthDataCondition"
              label="Who handles the health data (s.46)"
              hint="Only a health care provider or someone working under one, or someone bound by professional secrecy or a duty of confidentiality under a law, unless it's needed for public health."
              options={HEALTH_DATA_CONDITIONS}
              placeholder="Not decided yet"
              initial={activity?.healthDataCondition ?? ""}
              {...f}
            />
          </div>
          <TextArea
            name="sensitiveDataSafeguards"
            label="How the sensitive data is protected"
            hint="What protects it beyond the rest of the data, and whether it's kept apart, such as a separate file or system only named people can open (reg. 32(i))."
            initial={activity?.sensitiveDataSafeguards}
            {...f}
          />
        </div>
      </Card>

      {/* Like the transfer fields, the details are shown by CSS so they work before JS loads. */}
      <Card className="group space-y-5">
        <h2 className="font-semibold">Where the data comes from</h2>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="indirectCollection"
            defaultChecked={state?.values ? state.values.indirectCollection === "on" : Boolean(activity?.indirectCollection)}
            className="mt-0.5 size-4 accent-brand-600"
          />
          <span>
            <span className="font-medium text-stone-800">Some of it comes from someone other than the person it&apos;s about</span>
            <span className="block text-xs text-stone-500">
              Such as a parent giving a child&apos;s details, an employee giving their next of kin&apos;s, a credit report, a referral from
              another clinic, CCTV, or data from web browsing or biometric technology (s.28; reg. 6(1)). The Act expects data to come from
              the person unless one of the grounds below applies.
            </span>
          </span>
        </label>
        <div className="hidden space-y-5 group-has-[[name=indirectCollection]:checked]:block">
          <TextArea
            name="indirectSources"
            label="Where it comes from"
            hint="Each source and what it gives you. You'll need this to answer an access request (reg. 9(1)(e)), and the privacy notice shows it."
            initial={activity?.indirectSources}
            {...f}
          />
          <fieldset>
            <legend className="text-sm font-medium text-stone-800">What allows it (s.28(2))</legend>
            <p className="mt-1 text-xs text-stone-500">
              Tick each that applies to a source. If none does, collect the data from the person. A processor can leave this to the
              controller it works for.
            </p>
            <div className="mt-2 grid gap-2">
              {(Object.entries(INDIRECT_COLLECTION_GROUNDS) as [IndirectCollectionGround, string][]).map(([key, label]) => (
                <label key={key} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="indirectCollectionGrounds"
                    value={key}
                    defaultChecked={grounds.has(key)}
                    className="mt-0.5 size-4 accent-brand-600"
                  />
                  <span>
                    {label} <span className="text-xs text-stone-500">({INDIRECT_COLLECTION_GROUND_SECTION[key]})</span>
                  </span>
                </label>
              ))}
            </div>
            {f.errors?.indirectCollectionGrounds?.map((e) => (
              <p key={e} className="mt-1 text-xs text-red-700">
                {e}
              </p>
            ))}
          </fieldset>
          <TextArea
            name="indirectCollectionNotice"
            label="How people are told"
            hint="How, and how soon, people learn their data came from somewhere else. It must be within 14 days (reg. 6(3)): a letter or SMS, a form they sign, or signs where cameras record."
            initial={activity?.indirectCollectionNotice}
            {...f}
          />
        </div>
      </Card>

      {/* Like the transfer fields, the details are shown by CSS so they work before JS loads. */}
      <Card className="group space-y-5">
        <h2 className="font-semibold">Children&apos;s data</h2>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="involvesChildren"
            defaultChecked={state?.values ? state.values.involvesChildren === "on" : Boolean(activity?.involvesChildren)}
            className="mt-0.5 size-4 accent-brand-600"
          />
          <span>
            <span className="font-medium text-stone-800">Involves children&apos;s data</span>
            <span className="block text-xs text-stone-500">
              Anyone under 18, such as pupils, young patients or a member&apos;s children. A parent or guardian has to consent, and the
              processing has to protect the child&apos;s best interests (s.33). It also counts towards a DPIA (reg. 49(1)(e)).
            </span>
          </span>
        </label>
        <div className="hidden space-y-5 group-has-[[name=involvesChildren]:checked]:block">
          <TextArea
            name="childAgeCheck"
            label="How you know which data is a child's"
            hint="Such as a date of birth on the form checked against a birth certificate, or an age question before an account is opened. Match it to the risk: how much data, how much of it is children's and the harm that could follow (s.33(2) and (3))."
            initial={activity?.childAgeCheck}
            {...f}
          />
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="childCounselling"
              defaultChecked={state?.values ? state.values.childCounselling === "on" : Boolean(activity?.childCounselling)}
              className="mt-0.5 size-4 accent-brand-600"
            />
            <span>
              <span className="font-medium text-stone-800">Only counselling or child protection services for children</span>
              <span className="block text-xs text-stone-500">
                Then a parent&apos;s consent may not be needed (s.33(4)). Leave it unticked for anything else, such as a school that also
                has a counsellor.
              </span>
            </span>
          </label>
          <TextArea
            name="parentalConsent"
            label="How a parent or guardian consents"
            hint="How they agree, such as signing the admission form, and how you check they're the child's parent or guardian, such as their ID against the birth certificate (s.33(1)(a); reg. 13(2)(a)). A processor can leave this to the controller it works for."
            initial={activity?.parentalConsent}
            {...f}
          />
          <TextArea
            name="childSafeguards"
            label="How children are protected"
            hint="How the processing protects the child's best interests, such as who can see the data and what it's never used for, and how parents are told the risks and the safeguards (s.33(1)(b); reg. 13(2)(c)). The privacy notice shows this."
            initial={activity?.childSafeguards}
            {...f}
          />
        </div>
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
        <TextField
          name="retentionPeriod"
          label="Retention period"
          placeholder="e.g. 7 years after employment ends"
          hint="In your own words. This is what your privacy notice shows."
          initial={activity?.retentionPeriod}
          {...f}
        />
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">The period as a length (optional)</legend>
          <p className="text-sm text-stone-600">
            Lets Kinga show where the line falls on any day and when to go through the data again. Leave it blank when
            the period has no fixed length, such as &ldquo;until consent is withdrawn&rdquo;.
          </p>
          <div className="grid gap-5 sm:grid-cols-[8rem_10rem_1fr]">
            <TextField
              name="retentionLength"
              label="Length"
              inputMode="numeric"
              placeholder="e.g. 7"
              initial={activity?.retentionLength?.toString() ?? ""}
              {...f}
            />
            <SelectField name="retentionUnit" label="Unit" options={RETENTION_UNITS} placeholder="None" initial={activity?.retentionUnit ?? ""} {...f} />
            <TextField
              name="retentionFrom"
              label="Counted from"
              placeholder="e.g. the end of employment"
              hint="Read as “7 years from the end of employment”."
              initial={activity?.retentionFrom}
              {...f}
            />
          </div>
        </fieldset>
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
      </Card>

      {/* Like the transfer fields, the details are shown by CSS so they work before JS loads. */}
      <Card className="group space-y-5">
        <h2 className="font-semibold">Automated decisions</h2>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="automatedDecisions"
            defaultChecked={state?.values ? state.values.automatedDecisions === "on" : Boolean(activity?.automatedDecisions)}
            className="mt-0.5 size-4 accent-brand-600"
          />
          <span>
            <span className="font-medium text-stone-800">Decisions about people are taken by automated means alone</span>
            <span className="block text-xs text-stone-500">
              Only decisions with legal or similarly significant effects, taken without a person involved, such as a loan declined by a
              scoring model, applicants filtered out by software or an account blocked by a fraud rule (s.35).
            </span>
          </span>
        </label>
        <div className="hidden space-y-5 group-has-[[name=automatedDecisions]:checked]:block">
          <SelectField
            name="automatedDecisionGround"
            label="What allows it (s.35(2))"
            hint="If none of these applies, a person has to take the decision."
            options={AUTOMATED_DECISION_GROUNDS}
            placeholder="Not decided yet"
            initial={activity?.automatedDecisionGround ?? ""}
            {...f}
          />
          <TextArea
            name="automatedDecisionLogic"
            label="What is decided, and how"
            hint="What the decision is, the information and logic it uses, and what it means for the person. The privacy notice shows this."
            initial={activity?.automatedDecisionLogic}
            {...f}
          />
          <TextArea
            name="automatedDecisionReview"
            label="How people ask for a person to look again"
            hint="How you tell people in writing that a decision was automated, and how they ask you to reconsider it or have a person take it again. The privacy notice shows this."
            initial={activity?.automatedDecisionReview}
            {...f}
          />
          <TextArea
            name="automatedDecisionChecks"
            label="Checks for errors and bias"
            hint="How you test the method, check the results for mistakes and unfair treatment of any group, and put them right."
            initial={activity?.automatedDecisionChecks}
            {...f}
          />
        </div>
      </Card>

      <Card className="group space-y-5">
        <h2 className="font-semibold">Direct marketing</h2>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="directMarketing"
            defaultChecked={state?.values ? state.values.directMarketing === "on" : Boolean(activity?.directMarketing)}
            className="mt-0.5 size-4 accent-brand-600"
          />
          <span>
            <span className="font-medium text-stone-800">The data is used to market to people</span>
            <span className="block text-xs text-stone-500">
              Messages, calls, catalogues or adverts sent to particular people about what you sell, such as SMS offers, a newsletter or
              adverts shown to people who are signed in (s.37; reg. 14). Advertising that doesn&apos;t pick out who sees it isn&apos;t direct
              marketing.
            </span>
          </span>
        </label>
        <div className="hidden space-y-5 group-has-[[name=directMarketing]:checked]:block">
          <SelectField
            name="marketingGround"
            label="What allows it (s.37(1))"
            hint="If neither applies, stop the marketing. Marketing on consent needs a consent record, even when the activity itself has another lawful basis."
            options={MARKETING_GROUNDS}
            placeholder="Not decided yet"
            initial={activity?.marketingGround ?? ""}
            {...f}
          />
          <TextArea
            name="marketingChannels"
            label="How you market"
            hint="The channels (SMS, WhatsApp, email, calls, post, targeted adverts) and what you send. The privacy notice shows this."
            initial={activity?.marketingChannels}
            {...f}
          />
          <TextArea
            name="marketingOptOut"
            label="How people opt out"
            hint="What every message says about opting out, such as replying STOP or an unsubscribe link. It must be free, or cost no more than a nominal amount. The privacy notice shows this."
            initial={activity?.marketingOptOut}
            {...f}
          />
          <TextArea
            name="marketingOptOutRecords"
            label="Where opt-outs are kept"
            hint="Where you record who has opted out, and how that list is checked before every send so they aren't contacted again."
            initial={activity?.marketingOptOutRecords}
            {...f}
          />
        </div>
      </Card>

      <SubmitButton>{activity ? "Save changes" : "Add activity"}</SubmitButton>
    </form>
  );
}
