import type { Metadata } from "next";
import Link from "next/link";
import { startDpia } from "@/app/actions/dpia";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass, Card, DpiaStatusBadge, EmptyState, PageHeader, RiskLevelBadge } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { dpiaStatus, highestLevel, residualLevel } from "@/lib/dpia";
import { listActivities, listDpias, listOrgDpiaRisks } from "@/lib/queries";
import { dpiaRecommended, dpiaTriggers } from "@/lib/ropa";
import { requireOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Impact assessments" };

export default async function DpiaListPage() {
  const { org } = await requireOrgContext();
  const today = todayInKenya();
  const [rows, risks, activities] = await Promise.all([listDpias(org.id), listOrgDpiaRisks(org.id), listActivities(org.id)]);

  const assessed = new Set(rows.map((r) => r.dpia.activityId));
  const outstanding = activities.filter((a) => dpiaRecommended(a) && !assessed.has(a.id));
  const dpias = rows.map(({ dpia, activityName }) => ({
    ...dpia,
    activityName,
    status: dpiaStatus(dpia, today),
    residual: highestLevel(risks.filter((r) => r.dpiaId === dpia.id).map(residualLevel)),
  }));

  return (
    <>
      <PageHeader
        title="Data protection impact assessments"
        description="A DPIA is required before processing that is likely to result in high risk to people's rights (s.31). It records the risks and how you address them."
        actions={
          <Link href="/dpia/new" className={buttonClass.primary}>
            New DPIA
          </Link>
        }
      />

      {outstanding.length > 0 && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <h2 className="font-semibold">
            {outstanding.length === 1 ? "1 activity needs" : `${outstanding.length} activities need`} a DPIA
          </h2>
          <p className="text-sm text-stone-700">Screening of your RoPA flagged these as likely to be high risk.</p>
          <ul className="mt-3 divide-y divide-amber-200">
            {outstanding.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Link href={`/ropa/${a.id}`} className="font-medium hover:underline">
                    {a.name}
                  </Link>
                  <p className="text-sm text-stone-600">{dpiaTriggers(a).join(" · ")}</p>
                </div>
                <form action={startDpia}>
                  <input type="hidden" name="activityId" value={a.id} />
                  <SubmitButton variant="secondary" pendingText="Starting…">
                    Start DPIA
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {dpias.length === 0 ? (
        <EmptyState title="No DPIAs yet">
          Start one from a flagged activity above, or from a template for new processing you are planning.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Assessment</th>
                <th className="px-4 py-3 font-medium">Remaining risk</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {dpias.map((d) => (
                <tr key={d.id} className="align-top hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link href={`/dpia/${d.id}`} className="font-medium hover:underline">
                      {d.title}
                    </Link>
                    <p className="mt-0.5 text-stone-600">{d.activityName ?? "Not in the RoPA yet"}</p>
                  </td>
                  <td className="px-4 py-3">{d.residual ? <RiskLevelBadge level={d.residual} /> : <span className="text-stone-500">—</span>}</td>
                  <td className="px-4 py-3">
                    <DpiaStatusBadge status={d.status} />
                    {d.reviewOn && d.status !== "draft" && (
                      <p className="mt-1 text-xs text-stone-600">Review by {formatDate(d.reviewOn)}</p>
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
