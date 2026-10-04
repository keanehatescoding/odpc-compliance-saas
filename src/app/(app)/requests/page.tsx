import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Card, cx, EmptyState, PageHeader, Pill, RequestStatusBadge } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { listSubjectRequests } from "@/lib/queries";
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

export const metadata: Metadata = { title: "Data subject requests" };

export default async function RequestsPage() {
  const { org } = await requireOrgContext();
  const today = todayInKenya();
  const rows = (await listSubjectRequests(org.id)).map((r) => ({ ...r, status: requestStatus(r, today) }));

  return (
    <>
      <PageHeader
        title="Data subject requests"
        description="Log every request from someone asking to see, correct, delete or move their personal data, or to stop you using it. Most must be answered within 7 or 14 days, and none may be charged for except portability."
        actions={
          <Link href="/requests/new" className={buttonClass.primary}>
            Log a request
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="No requests logged">
          When a parent, patient, customer or member of staff asks what data you hold on them, or asks you to correct or
          delete it, log it here on the day it arrives. The deadline counts from that day.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Request</th>
                <th className="px-4 py-3 font-medium">Received</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link href={`/requests/${r.id}`} className="font-medium hover:underline">
                      {r.requesterName}
                    </Link>
                    <p className="mt-0.5 text-stone-600">{kindInfo(r.kind).label}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-stone-700">{formatDate(r.receivedOn)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <RequestStatusBadge status={r.status} />
                      {!isOpen(r.status) && respondedLate(r) && <Pill tone="amber">Late</Pill>}
                    </div>
                    {isOpen(r.status) && (
                      <p className={cx("mt-1 text-xs", r.status === "overdue" ? "text-red-700" : "text-stone-600")}>
                        Due {formatDate(responseDueOn(r))} · {formatDaysLeft(daysToRespond(r, today))}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
