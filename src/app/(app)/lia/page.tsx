import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Card, EmptyState, LiaStatusBadge, PageHeader } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { activitiesWithoutAssessment, LIA_OUTCOMES, liaStatus, type LiaOutcome } from "@/lib/lia";
import { listActivities, listInterestAssessments } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Legitimate interests" };

export default async function LiaListPage() {
  const { org } = await requireOrgContext();
  const today = todayInKenya();
  const [assessments, activities] = await Promise.all([listInterestAssessments(org.id), listActivities(org.id)]);
  const activityName = new Map(activities.map((a) => [a.id, a.name]));
  const uncovered = activitiesWithoutAssessment(activities, assessments);

  return (
    <>
      <PageHeader
        title="Legitimate interests"
        description="Section 30 of the Act lets you process personal data for your legitimate interests, unless that is unwarranted given the harm to the people concerned. An assessment records what the interest is, why you need the data for it and how you weighed it against their rights."
        actions={
          <Link href="/lia/new" className={buttonClass.primary}>
            Add an assessment
          </Link>
        }
      />

      {uncovered.length > 0 && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <h2 className="font-semibold">Activities that rely on legitimate interests with no assessment</h2>
          <ul className="mt-2 divide-y divide-amber-200">
            {uncovered.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/ropa/${a.id}`} className="font-medium hover:underline">
                  {a.name}
                </Link>
                <Link href={`/lia/new?activity=${a.id}`} className={buttonClass.secondary}>
                  Assess it
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {assessments.length === 0 ? (
        <EmptyState title="No assessments">
          Think of what you do with personal data because it is useful to you, not because the person agreed, a contract
          needs it or the law requires it: CCTV, a visitor log, fraud checks, chasing debts, keeping a customer list. Each
          needs a reason that outweighs the effect on the people concerned.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Assessment</th>
                <th className="px-4 py-3 font-medium">Decision</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {assessments.map((l) => (
                <tr key={l.id} className="align-top hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link href={`/lia/${l.id}`} className="font-medium hover:underline">
                      {l.name}
                    </Link>
                    <p className="mt-0.5 text-stone-600">
                      {l.activityId ? activityName.get(l.activityId) : "Not linked to a processing activity"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-stone-700">
                    {LIA_OUTCOMES[l.outcome as LiaOutcome]}
                    {l.decidedOn && (
                      <p className="mt-0.5 text-xs text-stone-600">
                        {l.decidedBy ? `${l.decidedBy}, ` : ""}
                        {formatDate(l.decidedOn)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <LiaStatusBadge status={liaStatus(l, today)} />
                    {l.reviewOn && <p className="mt-1 text-xs text-stone-600">Review {formatDate(l.reviewOn)}</p>}
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
