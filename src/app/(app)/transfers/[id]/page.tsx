import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteTransfer } from "@/app/actions/transfer";
import { RecordHistory } from "@/components/activity-list";
import { DeleteButton } from "@/components/delete-button";
import { BackLink, Card, cx, PageHeader, TransferStatusBadge } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { getTransfer, listActivities } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { daysToTransferReview, TRANSFER_TEST, transferGaps, transferStatus } from "@/lib/transfer";
import { isUuid } from "@/lib/uuid";
import { TransferForm } from "../transfer-form";

export const metadata: Metadata = { title: "Transfer outside Kenya" };

export default async function TransferPage({ params }: PageProps<"/transfers/[id]">) {
  const { id } = await params;
  const { org } = await requireOrgContext();
  const transfer = isUuid(id) ? await getTransfer(org.id, id) : null;
  if (!transfer) notFound();

  const activities = await listActivities(org.id);
  const activity = activities.find((a) => a.id === transfer.activityId) ?? null;

  const today = todayInKenya();
  const status = transferStatus(transfer, today);
  const gaps = transferGaps(transfer, activity);
  const reviewIn = daysToTransferReview(transfer, today);

  return (
    <>
      <BackLink href="/transfers">Transfers outside Kenya</BackLink>
      <PageHeader title={transfer.recipient} actions={<DeleteButton action={deleteTransfer.bind(null, transfer.id)} />} />

      <Card className={cx("mb-6 max-w-3xl", status === "review_due" && "border-amber-300 bg-amber-50")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TransferStatusBadge status={status} />
          {activity && (
            <p className="text-sm text-stone-700">
              Part of{" "}
              <Link href={`/ropa/${activity.id}`} className="font-medium hover:underline">
                {activity.name}
              </Link>
            </p>
          )}
        </div>
        {status === "review_due" && (
          <p className="mt-3 text-sm text-stone-700">
            This was due for review on <strong>{formatDate(transfer.reviewOn)}</strong>. Check the recipient, the countries and
            the agreement are still as described, then set the next review date.
          </p>
        )}
        {status === "in_place" && reviewIn !== null && (
          <p className="mt-3 text-sm text-stone-700">
            Next review on {formatDate(transfer.reviewOn)}, in {reviewIn} {reviewIn === 1 ? "day" : "days"}.
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
          <summary className="cursor-pointer font-medium">What a transfer record should show</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {TRANSFER_TEST.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-600">A checklist, not legal advice. Have a lawyer review the agreement a transfer depends on.</p>
        </details>
      </Card>

      <TransferForm transfer={transfer} activities={activities.map((a) => ({ id: a.id, name: a.name }))} />
      <RecordHistory orgId={org.id} subjectId={transfer.id} />
    </>
  );
}
