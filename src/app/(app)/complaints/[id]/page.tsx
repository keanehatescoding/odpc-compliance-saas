import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteComplaint } from "@/app/actions/complaints";
import { RecordHistory } from "@/components/activity-list";
import { DeleteButton } from "@/components/delete-button";
import { BackLink, Card, ComplaintStatusBadge, cx, PageHeader } from "@/components/ui";
import {
  APPEAL_DAYS,
  awaitsResponse,
  complaintStatus,
  CONCLUSION_DAYS,
  daysToAct,
  formatDaysLeft,
  kindInfo,
  respondedLate,
} from "@/lib/complaint";
import { addDays, formatDate, todayInKenya } from "@/lib/dates";
import { getComplaint } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { ComplaintForm } from "../complaint-form";

export const metadata: Metadata = { title: "ODPC complaint" };

export default async function ComplaintPage({ params }: PageProps<"/complaints/[id]">) {
  const { id } = await params;
  const { org } = await requireOrgContext();
  const complaint = isUuid(id) ? await getComplaint(org.id, id) : null;
  if (!complaint) notFound();

  const today = todayInKenya();
  const status = complaintStatus(complaint, today);
  const info = kindInfo(complaint.kind);
  const due = formatDate(complaint.dueOn);
  const awaiting = awaitsResponse(status);

  return (
    <>
      <BackLink href="/complaints">ODPC complaints</BackLink>
      <PageHeader
        title={info.label}
        description={[complaint.reference, `received ${formatDate(complaint.receivedOn)}`].filter(Boolean).join(" · ")}
        actions={<DeleteButton action={deleteComplaint.bind(null, complaint.id)} />}
      />

      <Card
        className={cx(
          "mb-6 max-w-3xl",
          status === "overdue" && "border-red-300 bg-red-50",
          status === "due_soon" && "border-orange-300 bg-orange-50",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ComplaintStatusBadge status={status} />
          {awaiting && (
            <p className={cx("text-2xl font-semibold", status === "overdue" ? "text-red-800" : "text-stone-900")}>
              {formatDaysLeft(daysToAct(complaint, today))}
            </p>
          )}
        </div>
        <p className="mt-3 text-sm text-stone-700">
          {awaiting ? (
            <>
              Act by <strong>{due}</strong> ({info.provision}).
              {status === "overdue" && " The date has passed. Deal with it as soon as you can, tell the ODPC why it is late, and record the date."}
            </>
          ) : (
            <>
              {complaint.respondedOn
                ? `Responded on ${formatDate(complaint.respondedOn)}${respondedLate(complaint) ? `, after the deadline of ${due}.` : `, within the deadline of ${due}.`}`
                : `Closed without a response on record. The deadline was ${due}.`}
              {status === "closed" && complaint.respondedOn && ` Closed on ${formatDate(complaint.closedOn)}.`}
            </>
          )}
        </p>
        {awaiting && <p className="mt-2 text-sm text-stone-700">{info.guidance}</p>}
        {status === "responded" && complaint.kind === "complaint" && (
          <p className="mt-2 text-sm text-stone-700">
            The ODPC has {CONCLUSION_DAYS} days from the complaint to investigate and decide it (s.56(5)). Record its
            decision, a settlement or a withdrawal below when it comes.
          </p>
        )}
        {status === "closed" && complaint.closedOn && complaint.kind !== "information" && (
          <p className="mt-2 text-sm text-stone-700">
            If the decision went against you, an appeal goes to the High Court (s.64). ODPC decisions give{" "}
            {APPEAL_DAYS} days, which would end on {formatDate(addDays(complaint.closedOn, APPEAL_DAYS))}. Check the
            date on the decision itself.
          </p>
        )}
      </Card>

      <ComplaintForm complaint={complaint} />
      <RecordHistory orgId={org.id} subjectId={complaint.id} />
    </>
  );
}
