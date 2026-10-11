import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { startDpia } from "@/app/actions/dpia";
import { deleteActivity } from "@/app/actions/ropa";
import { RecordHistory } from "@/components/activity-list";
import { DeleteButton } from "@/components/delete-button";
import { SubmitButton } from "@/components/submit-button";
import { BackLink, buttonClass, Card, ConsentStatusBadge, DpiaStatusBadge, PageHeader, ProcessorStatusBadge } from "@/components/ui";
import { todayInKenya } from "@/lib/dates";
import { dpiaStatus } from "@/lib/dpia";
import { consentStatus, reliesOnConsent } from "@/lib/consent";
import { processorStatus } from "@/lib/processor";
import { activityConsents, activityProcessors, getActivity, getDpiaForActivity } from "@/lib/queries";
import { dpiaRecommended, dpiaTriggers } from "@/lib/ropa";
import { requireOrgContext } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { ActivityForm } from "../activity-form";

export const metadata: Metadata = { title: "Edit processing activity" };

export default async function EditActivityPage({ params }: PageProps<"/ropa/[id]">) {
  const { id } = await params;
  const { org } = await requireOrgContext();
  const activity = isUuid(id) ? await getActivity(org.id, id) : null;
  if (!activity) notFound();
  const triggers = dpiaTriggers(activity);
  const recommended = dpiaRecommended(activity);
  const [dpia, processors, consents] = await Promise.all([
    getDpiaForActivity(org.id, activity.id),
    activityProcessors(org.id, activity.id),
    activityConsents(org.id, activity.id),
  ]);
  const today = todayInKenya();

  return (
    <>
      <BackLink href="/ropa">Records of processing</BackLink>
      <PageHeader title={activity.name} actions={<DeleteButton action={deleteActivity.bind(null, activity.id)} />} />
      {dpia ? (
        <Card className="mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">Impact assessment</h2>
            <DpiaStatusBadge status={dpiaStatus(dpia, today)} />
          </div>
          <Link href={`/dpia/${dpia.id}`} className={buttonClass.secondary}>
            Open DPIA
          </Link>
        </Card>
      ) : (
        triggers.length > 0 && (
          <Card className={`mb-6 max-w-3xl ${recommended ? "border-amber-300 bg-amber-50" : ""}`}>
            <h2 className="font-semibold">{recommended ? "A DPIA is recommended for this activity" : "Risk factors"}</h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-stone-700">
              {triggers.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            {recommended && (
              <>
                <p className="mt-3 text-xs text-stone-600">
                  Section 31 of the Data Protection Act requires a DPIA before processing that is likely to result in high risk
                  to people&apos;s rights. This is a screening prompt, not a legal determination.
                </p>
                <form action={startDpia} className="mt-4">
                  <input type="hidden" name="activityId" value={activity.id} />
                  <SubmitButton variant="secondary" pendingText="Starting…">
                    Start DPIA
                  </SubmitButton>
                </form>
              </>
            )}
          </Card>
        )
      )}
      {processors.length > 0 && (
        <Card className="mb-6 max-w-3xl">
          <h2 className="font-semibold">Processors that handle this data</h2>
          <ul className="mt-2 divide-y divide-stone-100">
            {processors.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/processors/${p.id}`} className="font-medium hover:underline">
                  {p.name}
                </Link>
                <ProcessorStatusBadge status={processorStatus(p, today)} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {consents.length > 0 ? (
        <Card className="mb-6 max-w-3xl">
          <h2 className="font-semibold">Consent this activity relies on</h2>
          <ul className="mt-2 divide-y divide-stone-100">
            {consents.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/consents/${c.id}`} className="font-medium hover:underline">
                  {c.name}
                </Link>
                <ConsentStatusBadge status={consentStatus(c, today)} />
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        reliesOnConsent(activity) && (
          <Card className="mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-3 border-amber-300 bg-amber-50">
            <div>
              <h2 className="font-semibold">No consent record</h2>
              <p className="mt-1 text-sm text-stone-700">
                This activity relies on consent, and section 32 of the Act says it is for you to prove it was given.
              </p>
            </div>
            <Link href={`/consents/new?activity=${activity.id}`} className={buttonClass.secondary}>
              Record the consent
            </Link>
          </Card>
        )
      )}
      <ActivityForm activity={activity} />
      <RecordHistory orgId={org.id} subjectId={activity.id} />
    </>
  );
}
