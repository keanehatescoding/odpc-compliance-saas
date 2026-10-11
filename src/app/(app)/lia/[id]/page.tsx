import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteLia } from "@/app/actions/lia";
import { RecordHistory } from "@/components/activity-list";
import { DeleteButton } from "@/components/delete-button";
import { BackLink, Card, cx, LiaStatusBadge, PageHeader } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { daysToLiaReview, LIA_TEST, liaGaps, liaStatus } from "@/lib/lia";
import { getInterestAssessment, listActivities } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { LiaForm } from "../lia-form";

export const metadata: Metadata = { title: "Legitimate interest assessment" };

export default async function LiaPage({ params }: PageProps<"/lia/[id]">) {
  const { id } = await params;
  const { org } = await requireOrgContext();
  const assessment = isUuid(id) ? await getInterestAssessment(org.id, id) : null;
  if (!assessment) notFound();

  const activities = await listActivities(org.id);
  const activity = activities.find((a) => a.id === assessment.activityId) ?? null;

  const today = todayInKenya();
  const status = liaStatus(assessment, today);
  const gaps = liaGaps(assessment, activity);
  const reviewIn = daysToLiaReview(assessment, today);

  return (
    <>
      <BackLink href="/lia">Legitimate interests</BackLink>
      <PageHeader title={assessment.name} actions={<DeleteButton action={deleteLia.bind(null, assessment.id)} />} />

      <Card
        className={cx(
          "mb-6 max-w-3xl",
          status === "not_justified" && "border-red-300 bg-red-50",
          status === "review_due" && "border-amber-300 bg-amber-50",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LiaStatusBadge status={status} />
          {activity && (
            <p className="text-sm text-stone-700">
              For{" "}
              <Link href={`/ropa/${activity.id}`} className="font-medium hover:underline">
                {activity.name}
              </Link>
            </p>
          )}
        </div>
        {status === "not_justified" && (
          <p className="mt-3 text-sm text-stone-700">
            This assessment found that people&apos;s rights outweigh the interest, so legitimate interests can&apos;t be the
            lawful basis for the processing as it stands.
          </p>
        )}
        {status === "review_due" && (
          <p className="mt-3 text-sm text-stone-700">
            This was due for review on <strong>{formatDate(assessment.reviewOn)}</strong>. Check the processing and its
            effect on people are still as described, then set the next review date.
          </p>
        )}
        {status === "in_place" && reviewIn !== null && (
          <p className="mt-3 text-sm text-stone-700">
            Next review on {formatDate(assessment.reviewOn)}, in {reviewIn} {reviewIn === 1 ? "day" : "days"}.
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
          <summary className="cursor-pointer font-medium">What an assessment should show</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {LIA_TEST.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-600">A checklist, not legal advice. Have a lawyer review an assessment the processing depends on.</p>
        </details>
      </Card>

      <LiaForm assessment={assessment} activities={activities.map((a) => ({ id: a.id, name: a.name }))} />
      <RecordHistory orgId={org.id} subjectId={assessment.id} />
    </>
  );
}
