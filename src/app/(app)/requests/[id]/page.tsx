import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteSubjectRequest } from "@/app/actions/subject-requests";
import { DeleteButton } from "@/components/delete-button";
import { BackLink, Card, cx, PageHeader, RequestStatusBadge } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { getSubjectRequest } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import {
  daysToRespond,
  formatDaysLeft,
  isOpen,
  kindInfo,
  requestStatus,
  respondedLate,
  responseDueOn,
} from "@/lib/subject-request";
import { isUuid } from "@/lib/uuid";
import { RequestForm } from "../request-form";

export const metadata: Metadata = { title: "Data subject request" };

export default async function RequestPage({ params }: PageProps<"/requests/[id]">) {
  const { id } = await params;
  const { org } = await requireOrgContext();
  const request = isUuid(id) ? await getSubjectRequest(org.id, id) : null;
  if (!request) notFound();

  const today = todayInKenya();
  const status = requestStatus(request, today);
  const info = kindInfo(request.kind);
  const due = formatDate(responseDueOn(request));
  const open = isOpen(status);

  return (
    <>
      <BackLink href="/requests">Data subject requests</BackLink>
      <PageHeader
        title={request.requesterName}
        description={`${info.label} · received ${formatDate(request.receivedOn)}`}
        actions={<DeleteButton action={deleteSubjectRequest.bind(null, request.id)} />}
      />

      <Card
        className={cx(
          "mb-6 max-w-3xl",
          status === "overdue" && "border-red-300 bg-red-50",
          status === "due_soon" && "border-orange-300 bg-orange-50",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RequestStatusBadge status={status} />
          {open && (
            <p className={cx("text-2xl font-semibold", status === "overdue" ? "text-red-800" : "text-stone-900")}>
              {formatDaysLeft(daysToRespond(request, today))}
            </p>
          )}
        </div>
        <p className="mt-3 text-sm text-stone-700">
          {open ? (
            <>
              Respond by <strong>{due}</strong>, {info.days} days after you received it ({info.regulation} of the Data
              Protection (General) Regulations).
              {status === "overdue" && " The deadline has passed. Respond as soon as you can and record the date."}
            </>
          ) : (
            <>
              {status === "completed" ? "Done" : "Declined"} on {formatDate(request.respondedOn)}
              {respondedLate(request) ? `, after the deadline of ${due}.` : `, within the deadline of ${due}.`}
            </>
          )}
        </p>
        {open && (info.declineDays || info.declineNote) && (
          <p className="mt-2 text-sm text-stone-700">
            If you decline:{" "}
            {info.declineDays && `tell them in writing, with your reasons, within ${info.declineDays} days. `}
            {info.declineNote}
          </p>
        )}
      </Card>

      <RequestForm request={request} />
    </>
  );
}
