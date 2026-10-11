import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { startDpia } from "@/app/actions/dpia";
import { deleteActivity } from "@/app/actions/ropa";
import { RecordHistory } from "@/components/activity-list";
import { DeleteButton } from "@/components/delete-button";
import { SubmitButton } from "@/components/submit-button";
import { BackLink, buttonClass, Card, ConsentStatusBadge, DpiaStatusBadge, LiaStatusBadge, PageHeader, ProcessorStatusBadge, TransferStatusBadge } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { dpiaStatus } from "@/lib/dpia";
import { consentStatus, reliesOnConsent } from "@/lib/consent";
import { liaStatus, reliesOnLegitimateInterests } from "@/lib/lia";
import { processorStatus } from "@/lib/processor";
import { transferStatus } from "@/lib/transfer";
import { activityAssessments, activityConsents, activityProcessors, activityTransfers, getActivity, getDpiaForActivity, listDisposals } from "@/lib/queries";
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
  const [dpia, processors, consents, assessments, transfers, allDisposals] = await Promise.all([
    getDpiaForActivity(org.id, activity.id),
    activityProcessors(org.id, activity.id),
    activityConsents(org.id, activity.id),
    activityAssessments(org.id, activity.id),
    activityTransfers(org.id, activity.id),
    listDisposals(org.id),
  ]);
  const disposals = allDisposals.filter((d) => d.activityId === activity.id);
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
      {assessments.length > 0 ? (
        <Card className="mb-6 max-w-3xl">
          <h2 className="font-semibold">Legitimate interest assessments</h2>
          <ul className="mt-2 divide-y divide-stone-100">
            {assessments.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/lia/${l.id}`} className="font-medium hover:underline">
                  {l.name}
                </Link>
                <LiaStatusBadge status={liaStatus(l, today)} />
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        reliesOnLegitimateInterests(activity) && (
          <Card className="mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-3 border-amber-300 bg-amber-50">
            <div>
              <h2 className="font-semibold">No legitimate interest assessment</h2>
              <p className="mt-1 text-sm text-stone-700">
                This activity relies on legitimate interests, which only holds if your interest outweighs the effect on the people
                concerned. An assessment is how you show it does.
              </p>
            </div>
            <Link href={`/lia/new?activity=${activity.id}`} className={buttonClass.secondary}>
              Assess it
            </Link>
          </Card>
        )
      )}
      {transfers.length > 0 ? (
        <Card className="mb-6 max-w-3xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Transfers outside Kenya</h2>
            <Link href={`/transfers/new?activity=${activity.id}`} className="text-sm font-medium hover:underline">
              Add another
            </Link>
          </div>
          <ul className="mt-2 divide-y divide-stone-100">
            {transfers.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <Link href={`/transfers/${t.id}`} className="font-medium hover:underline">
                    {t.recipient}
                  </Link>
                  {t.countries && <span className="text-stone-600"> · {t.countries}</span>}
                </span>
                <TransferStatusBadge status={transferStatus(t, today)} />
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        activity.crossBorder && (
          <Card className="mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-3 border-amber-300 bg-amber-50">
            <div>
              <h2 className="font-semibold">No transfer record</h2>
              <p className="mt-1 text-sm text-stone-700">
                This activity sends data outside Kenya, which the Act allows only with appropriate safeguards or where the
                transfer is necessary. A transfer record says who receives the data and what the transfer relies on.
              </p>
            </div>
            <Link href={`/transfers/new?activity=${activity.id}`} className={buttonClass.secondary}>
              Record it
            </Link>
          </Card>
        )
      )}
      <Card className="mb-6 max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Disposal</h2>
            <p className="mt-1 text-sm text-stone-700">Kept for: {activity.retentionPeriod}</p>
          </div>
          <Link href={`/disposals/new?activity=${activity.id}`} className={buttonClass.secondary}>
            Record a disposal
          </Link>
        </div>
        {disposals.length > 0 ? (
          <ul className="mt-2 divide-y divide-stone-100">
            {disposals.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/disposals/${d.id}`} className="font-medium hover:underline">
                  {formatDate(d.disposedOn)}
                </Link>
                <span className="text-stone-600">{d.description}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-stone-600">No disposals recorded for this activity.</p>
        )}
      </Card>
      <ActivityForm activity={activity} />
      <RecordHistory orgId={org.id} subjectId={activity.id} />
    </>
  );
}
