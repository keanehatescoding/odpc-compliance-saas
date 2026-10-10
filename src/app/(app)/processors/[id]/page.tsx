import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteProcessor } from "@/app/actions/processors";
import { RecordHistory } from "@/components/activity-list";
import { DeleteButton } from "@/components/delete-button";
import { BackLink, Card, cx, PageHeader, ProcessorStatusBadge } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { CONTRACT_TERMS, daysToReview, processorGaps, processorStatus } from "@/lib/processor";
import { getProcessor, listActivities, listProcessorLinks } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { ProcessorForm } from "../processor-form";

export const metadata: Metadata = { title: "Processor" };

export default async function ProcessorPage({ params }: PageProps<"/processors/[id]">) {
  const { id } = await params;
  const { org } = await requireOrgContext();
  const processor = isUuid(id) ? await getProcessor(org.id, id) : null;
  if (!processor) notFound();

  const [activities, links] = await Promise.all([listActivities(org.id), listProcessorLinks(org.id)]);
  const linkedIds = links.filter((l) => l.processorId === processor.id).map((l) => l.activityId);
  const linked = activities.filter((a) => linkedIds.includes(a.id));

  const today = todayInKenya();
  const status = processorStatus(processor, today);
  const gaps = processorGaps(processor, linked);
  const reviewIn = daysToReview(processor, today);

  return (
    <>
      <BackLink href="/processors">Processors</BackLink>
      <PageHeader title={processor.name} actions={<DeleteButton action={deleteProcessor.bind(null, processor.id)} />} />

      <Card
        className={cx(
          "mb-6 max-w-3xl",
          status === "no_contract" && "border-red-300 bg-red-50",
          status === "review_due" && "border-amber-300 bg-amber-50",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ProcessorStatusBadge status={status} />
          {processor.contractSignedOn && <p className="text-sm text-stone-700">Signed {formatDate(processor.contractSignedOn)}</p>}
        </div>
        {status === "review_due" && (
          <p className="mt-3 text-sm text-stone-700">
            The contract was due for review on <strong>{formatDate(processor.contractReviewOn)}</strong>. Check it still
            matches what they do for you, then set the next review date.
          </p>
        )}
        {status === "in_place" && reviewIn !== null && (
          <p className="mt-3 text-sm text-stone-700">
            Next review on {formatDate(processor.contractReviewOn)}, in {reviewIn} {reviewIn === 1 ? "day" : "days"}.
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
          <summary className="cursor-pointer font-medium">What the contract should say</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {CONTRACT_TERMS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-600">A checklist, not legal advice. Have a lawyer review the contract itself.</p>
        </details>
      </Card>

      <ProcessorForm processor={processor} activities={activities.map((a) => ({ id: a.id, name: a.name }))} linkedActivityIds={linkedIds} />
      <RecordHistory orgId={org.id} subjectId={processor.id} />
    </>
  );
}
