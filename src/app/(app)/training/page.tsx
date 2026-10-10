import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Card, EmptyState, PageHeader, TrainingStatusBadge } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { listTrainingSessions } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { refreshedIds, trainingStatus } from "@/lib/training";

export const metadata: Metadata = { title: "Staff training" };

export default async function TrainingPage() {
  const { org } = await requireOrgContext();
  const today = todayInKenya();
  const sessions = await listTrainingSessions(org.id);
  const refreshed = refreshedIds(sessions);
  const rows = sessions.map((s) => ({ ...s, status: trainingStatus(s, refreshed, today) }));

  return (
    <>
      <PageHeader
        title="Staff training"
        description="A log of the data protection training your staff have had. The Act expects you to back your security with organisational measures, and a dated record of who was trained in what is the first thing an auditor or the ODPC asks to see."
        actions={
          <Link href="/training/new" className={buttonClass.primary}>
            Record a session
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="No training recorded">
          Record each session once it has been held: an induction talk for new staff, a workshop from a law firm, a
          briefing at a staff meeting. Count who came and keep the attendance register somewhere you can find it.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Session</th>
                <th className="px-4 py-3 font-medium">Held</th>
                <th className="px-4 py-3 font-medium">Attended</th>
                <th className="px-4 py-3 font-medium">Refresher</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((s) => (
                <tr key={s.id} className="align-top hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link href={`/training/${s.id}`} className="font-medium hover:underline">
                      {s.title}
                    </Link>
                    <p className="mt-0.5 line-clamp-2 text-stone-600">{s.audience}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-stone-700">{formatDate(s.heldOn)}</td>
                  <td className="px-4 py-3 text-stone-700 tabular-nums">{s.attendeeCount ?? "—"}</td>
                  <td className="px-4 py-3">
                    <TrainingStatusBadge status={s.status} />
                    {s.status !== "refreshed" && s.refresherOn && (
                      <p className="mt-1 text-xs text-stone-600">
                        {s.status === "refresher_due" ? "Was due" : "Due"} {formatDate(s.refresherOn)}
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
