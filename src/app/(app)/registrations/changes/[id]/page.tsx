import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteParticularChange } from "@/app/actions/particulars";
import { RecordHistory } from "@/components/activity-list";
import { DeleteButton } from "@/components/delete-button";
import { BackLink, Card, cx, PageHeader, ParticularChangeStatusBadge } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { daysToNotify, formatDaysLeft, notifiedLate, notifyBy, particularChangeStatus, roleLabel } from "@/lib/particulars";
import { getParticularChange } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { ParticularChangeForm } from "../particular-change-form";

export const metadata: Metadata = { title: "Change of registered particulars" };

export default async function ParticularChangePage({ params }: PageProps<"/registrations/changes/[id]">) {
  const { id } = await params;
  const { org } = await requireOrgContext();
  const change = isUuid(id) ? await getParticularChange(org.id, id) : null;
  if (!change) notFound();

  const today = todayInKenya();
  const status = particularChangeStatus(change, today);
  const left = daysToNotify(change, today);

  return (
    <>
      <BackLink href="/registrations">ODPC registration</BackLink>
      <PageHeader
        title={`Change to ${roleLabel(change.role)}`}
        description={`Changed on ${formatDate(change.changedOn)}`}
        actions={<DeleteButton action={deleteParticularChange.bind(null, change.id)} />}
      />

      <Card className={cx("mb-6 max-w-3xl", status === "overdue" && "border-red-300 bg-red-50", status === "due_soon" && "border-orange-300 bg-orange-50")}>
        <div className="flex flex-wrap items-center gap-3">
          <ParticularChangeStatusBadge status={status} />
          {status !== "notified" && (
            <span className="text-sm text-stone-700">
              Notify by <strong>{formatDate(notifyBy(change))}</strong> ({formatDaysLeft(left)})
            </span>
          )}
        </div>
        {status === "notified" ? (
          <p className="mt-3 text-sm text-stone-700">
            The ODPC was told on {formatDate(change.notifiedOn)}
            {notifiedLate(change) ? `, after the 14 days ended on ${formatDate(notifyBy(change))}.` : "."}
          </p>
        ) : (
          <p className="mt-3 text-sm text-stone-700">
            Regulation 15 of the Registration Regulations, 2021 requires telling the Data Commissioner in writing within 14 days of
            the change. Not doing so is an offence. The Commissioner updates the register and may ask for documents to support it.
          </p>
        )}
      </Card>

      <ParticularChangeForm change={change} today={today} />
      <RecordHistory orgId={org.id} subjectId={change.id} />
    </>
  );
}
