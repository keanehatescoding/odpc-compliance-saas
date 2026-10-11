import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteDisposal } from "@/app/actions/disposals";
import { RecordHistory } from "@/components/activity-list";
import { DeleteButton } from "@/components/delete-button";
import { BackLink, buttonClass, Card, cx, DisposalStatusBadge, PageHeader } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { daysToNextDisposal, DISPOSAL_CHECKS, disposalGaps, disposalStatus, followedUp, latestByActivity } from "@/lib/disposal";
import { listActivities, listDisposals } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { DisposalForm } from "../disposal-form";

export const metadata: Metadata = { title: "Disposal" };

export default async function DisposalPage({ params }: PageProps<"/disposals/[id]">) {
  const { id } = await params;
  const { org } = await requireOrgContext();
  const all = isUuid(id) ? await listDisposals(org.id) : [];
  const disposal = all.find((d) => d.id === id);
  if (!disposal) notFound();

  const activities = await listActivities(org.id);
  const activity = activities.find((a) => a.id === disposal.activityId) ?? null;

  const today = todayInKenya();
  const latest = latestByActivity(all);
  const status = disposalStatus(disposal, latest, today);
  const superseded = followedUp(disposal, latest);
  const gaps = disposalGaps(disposal);
  const nextIn = daysToNextDisposal(disposal, today);

  return (
    <>
      <BackLink href="/disposals">Data disposal</BackLink>
      <PageHeader
        title={`Disposal on ${formatDate(disposal.disposedOn)}`}
        description={disposal.description}
        actions={<DeleteButton action={deleteDisposal.bind(null, disposal.id)} />}
      />

      <Card className={cx("mb-6 max-w-3xl", status === "next_due" && "border-amber-300 bg-amber-50")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DisposalStatusBadge status={status} />
          {activity && (
            <p className="text-sm text-stone-700">
              From{" "}
              <Link href={`/ropa/${activity.id}`} className="font-medium hover:underline">
                {activity.name}
              </Link>
              , kept for: {activity.retentionPeriod}
            </p>
          )}
        </div>
        {status === "next_due" && (
          <p className="mt-3 text-sm text-stone-700">
            This data was due to be gone through again on <strong>{formatDate(disposal.nextOn)}</strong>. Once that is
            done, record it as a new disposal.
          </p>
        )}
        {status === "done" && !superseded && nextIn !== null && (
          <p className="mt-3 text-sm text-stone-700">
            Next round on {formatDate(disposal.nextOn)}, in {nextIn} {nextIn === 1 ? "day" : "days"}.
          </p>
        )}
        {superseded && activity && (
          <p className="mt-3 text-sm text-stone-700">A later disposal has been recorded for {activity.name}.</p>
        )}
        {gaps.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-stone-700">
            {gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        )}
        {status === "next_due" && (
          <p className="mt-4">
            <Link
              href={disposal.activityId ? `/disposals/new?activity=${disposal.activityId}` : "/disposals/new"}
              className={buttonClass.secondary}
            >
              Record the next disposal
            </Link>
          </p>
        )}
        <details className="mt-3 text-sm text-stone-700">
          <summary className="cursor-pointer font-medium">What to check when you dispose of data</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {DISPOSAL_CHECKS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-600">A checklist, not legal advice.</p>
        </details>
      </Card>

      <DisposalForm disposal={disposal} activities={activities.map((a) => ({ id: a.id, name: a.name }))} today={today} />
      <RecordHistory orgId={org.id} subjectId={disposal.id} />
    </>
  );
}
