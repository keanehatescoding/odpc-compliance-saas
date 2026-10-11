import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Card, ComplaintStatusBadge, cx, EmptyState, PageHeader, Pill } from "@/components/ui";
import { awaitsResponse, complaintStatus, daysToAct, formatDaysLeft, kindInfo, respondedLate } from "@/lib/complaint";
import { formatDate, todayInKenya } from "@/lib/dates";
import { listComplaints } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "ODPC complaints" };

export default async function ComplaintsPage() {
  const { org } = await requireOrgContext();
  const today = todayInKenya();
  const rows = (await listComplaints(org.id)).map((c) => ({ ...c, status: complaintStatus(c, today) }));

  return (
    <>
      <PageHeader
        title="ODPC complaints"
        description="Log every letter from the Office of the Data Protection Commissioner that gives you a date to act by: a complaint someone has made about you, an enforcement or penalty notice, or a request for information. You have 21 days to answer a complaint."
        actions={
          <Link href="/complaints/new" className={buttonClass.primary}>
            Log a complaint or notice
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="Nothing from the ODPC logged">
          When the ODPC writes to say someone has complained about how you handled their data, log it here the day it
          arrives. The 21 days to respond count from that day, and the ODPC decides without you if you miss them.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">From the ODPC</th>
                <th className="px-4 py-3 font-medium">Received</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((c) => (
                <tr key={c.id} className="align-top hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link href={`/complaints/${c.id}`} className="font-medium hover:underline">
                      {kindInfo(c.kind).label}
                    </Link>
                    <p className="mt-0.5 text-stone-600">{[c.reference, c.complainant].filter(Boolean).join(" · ") || c.summary}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-stone-700">{formatDate(c.receivedOn)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <ComplaintStatusBadge status={c.status} />
                      {respondedLate(c) && <Pill tone="amber">Late</Pill>}
                    </div>
                    {awaitsResponse(c.status) && (
                      <p className={cx("mt-1 text-xs", c.status === "overdue" ? "text-red-700" : "text-stone-600")}>
                        Due {formatDate(c.dueOn)} · {formatDaysLeft(daysToAct(c, today))}
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
