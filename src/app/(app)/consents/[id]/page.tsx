import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteConsent } from "@/app/actions/consents";
import { RecordHistory } from "@/components/activity-list";
import { DeleteButton } from "@/components/delete-button";
import { BackLink, Card, ConsentStatusBadge, cx, PageHeader } from "@/components/ui";
import { consentGaps, consentStatus, daysToConsentReview, VALID_CONSENT } from "@/lib/consent";
import { formatDate, todayInKenya } from "@/lib/dates";
import { getConsentRecord, listActivities } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { ConsentForm } from "../consent-form";

export const metadata: Metadata = { title: "Consent record" };

export default async function ConsentPage({ params }: PageProps<"/consents/[id]">) {
  const { id } = await params;
  const { org } = await requireOrgContext();
  const consent = isUuid(id) ? await getConsentRecord(org.id, id) : null;
  if (!consent) notFound();

  const activities = await listActivities(org.id);
  const activity = activities.find((a) => a.id === consent.activityId) ?? null;

  const today = todayInKenya();
  const status = consentStatus(consent, today);
  const gaps = consentGaps(consent, activity);
  const reviewIn = daysToConsentReview(consent, today);

  return (
    <>
      <BackLink href="/consents">Consent records</BackLink>
      <PageHeader title={consent.name} actions={<DeleteButton action={deleteConsent.bind(null, consent.id)} />} />

      <Card
        className={cx(
          "mb-6 max-w-3xl",
          status === "incomplete" && "border-red-300 bg-red-50",
          status === "review_due" && "border-amber-300 bg-amber-50",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ConsentStatusBadge status={status} />
          {activity && (
            <p className="text-sm text-stone-700">
              For{" "}
              <Link href={`/ropa/${activity.id}`} className="font-medium hover:underline">
                {activity.name}
              </Link>
            </p>
          )}
        </div>
        {status === "review_due" && (
          <p className="mt-3 text-sm text-stone-700">
            This was due for review on <strong>{formatDate(consent.reviewOn)}</strong>. Check the wording still matches
            what you do with the data, then set the next review date.
          </p>
        )}
        {status === "in_place" && reviewIn !== null && (
          <p className="mt-3 text-sm text-stone-700">
            Next review on {formatDate(consent.reviewOn)}, in {reviewIn} {reviewIn === 1 ? "day" : "days"}.
          </p>
        )}
        {gaps.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-stone-700">
            {gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        )}
        <details className="mt-3 text-sm text-stone-700">
          <summary className="cursor-pointer font-medium">What makes consent valid</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {VALID_CONSENT.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-600">A checklist, not legal advice. Have a lawyer review the wording itself.</p>
        </details>
      </Card>

      <ConsentForm consent={consent} activities={activities.map((a) => ({ id: a.id, name: a.name }))} />
      <RecordHistory orgId={org.id} subjectId={consent.id} />
    </>
  );
}
