import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Card, DisposalStatusBadge, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import {
  DISPOSAL_METHODS,
  DISPOSAL_REASONS,
  disposalStatus,
  latestRoundByActivity,
  type DisposalMethod,
  type DisposalReason,
} from "@/lib/disposal";
import { listActivities, listDisposals } from "@/lib/queries";
import { activityNextRound, describeRetention, retentionCutoff } from "@/lib/retention";
import { requireOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Data disposal" };

export default async function DisposalsPage() {
  const { org } = await requireOrgContext();
  const today = todayInKenya();
  const [disposals, activities] = await Promise.all([listDisposals(org.id), listActivities(org.id)]);
  const lastRound = latestRoundByActivity(disposals);
  const activityName = new Map(activities.map((a) => [a.id, a.name]));
  const rows = disposals.map((d) => ({ ...d, status: disposalStatus(d, lastRound, today) }));
  const schedule = activities.map((a) => ({
    ...a,
    period: describeRetention(a),
    cutoff: retentionCutoff(a, today),
    next: activityNextRound(a, disposals, today),
  }));

  return (
    <>
      <PageHeader
        title="Data disposal"
        description="A log of the personal data you have deleted, destroyed or anonymised. The Act says you keep personal data only as long as you need it, and a dated record of what went is how you show you kept to your retention periods."
        actions={
          <Link href="/disposals/new" className={buttonClass.primary}>
            Record a disposal
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="No disposals recorded">
          Record each one once it is done: old files shredded, leavers&apos; accounts deleted, footage wiped. Say what
          went, how, and who approved it, and keep the proof somewhere you can find it.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Disposed of</th>
                <th className="px-4 py-3 font-medium">What</th>
                <th className="px-4 py-3 font-medium">Why and how</th>
                <th className="px-4 py-3 font-medium">Records</th>
                <th className="px-4 py-3 font-medium">Next round</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((d) => (
                <tr key={d.id} className="align-top hover:bg-stone-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link href={`/disposals/${d.id}`} className="font-medium hover:underline">
                      {formatDate(d.disposedOn)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="line-clamp-2">{d.description}</p>
                    {d.activityId && <p className="mt-0.5 text-stone-600">{activityName.get(d.activityId)}</p>}
                  </td>
                  <td className="px-4 py-3 text-stone-700">
                    <p>{DISPOSAL_REASONS[d.reason as DisposalReason]}</p>
                    <p className="mt-0.5 text-stone-600">{DISPOSAL_METHODS[d.method as DisposalMethod]}</p>
                  </td>
                  <td className="px-4 py-3 text-stone-700 tabular-nums">{d.recordCount ?? "—"}</td>
                  <td className="px-4 py-3">
                    {d.status === "next_due" ? (
                      <>
                        <DisposalStatusBadge status={d.status} />
                        <p className="mt-1 text-xs text-stone-600">Was due {formatDate(d.nextOn)}</p>
                      </>
                    ) : d.nextOn && d.nextOn > today ? (
                      <span className="whitespace-nowrap text-stone-700">{formatDate(d.nextOn)}</span>
                    ) : (
                      <span className="text-stone-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {activities.length > 0 && (
        <>
          <h2 className="mt-10 mb-1 text-lg font-semibold">Retention schedule</h2>
          <p className="mb-4 max-w-2xl text-sm text-stone-600">
            How long each activity in your Records of processing says it keeps personal data, and when to go through it
            again. Where the period is given as a length, Kinga shows where the line falls today and plans a round once
            the period has passed, or every year if that comes sooner. Erasure requests and withdrawn consent don&apos;t
            count as rounds.
          </p>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600 uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Activity</th>
                  <th className="px-4 py-3 font-medium">Kept for</th>
                  <th className="px-4 py-3 font-medium">Past its period</th>
                  <th className="px-4 py-3 font-medium">Last round</th>
                  <th className="px-4 py-3 font-medium">Next round</th>
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Record</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {schedule.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link href={`/ropa/${a.id}`} className="font-medium hover:underline">
                        {a.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-stone-700">
                      <p>{a.retentionPeriod}</p>
                      {a.period && <p className="mt-0.5 text-xs text-stone-600">{a.period}</p>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-stone-700">
                      {a.cutoff ? `From before ${formatDate(a.cutoff)}` : <span className="text-stone-500">No fixed length</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-stone-700">
                      {lastRound.has(a.id) ? formatDate(lastRound.get(a.id)!) : <span className="text-stone-500">None recorded</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {a.next?.due ? (
                        <>
                          <DisposalStatusBadge status="next_due" />
                          <p className="mt-1 text-xs text-stone-600">Was due {formatDate(a.next.on)}</p>
                        </>
                      ) : a.next ? (
                        <span className="text-stone-700">{formatDate(a.next.on)}</span>
                      ) : (
                        <span className="text-stone-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link href={`/disposals/new?activity=${a.id}`} className="font-medium text-brand-700 hover:underline">
                        Record a disposal
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
