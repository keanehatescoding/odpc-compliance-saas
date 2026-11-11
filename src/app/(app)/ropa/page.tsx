import type { Metadata } from "next";
import Link from "next/link";
import { ParticularsPrompt } from "@/components/particulars-prompt";
import { buttonClass, Card, cx, EmptyState, PageHeader, Pill } from "@/components/ui";
import type { ProcessingActivity } from "@/db/schema";
import { automatedDecisionIssues } from "@/lib/automated-decision";
import { directMarketingIssues } from "@/lib/direct-marketing";
import { LAWFUL_BASES, type LawfulBasis } from "@/lib/dpa";
import { indirectCollectionIssues } from "@/lib/indirect-collection";
import { suggestionFromQuery } from "@/lib/particulars";
import { listActivities, listDpias } from "@/lib/queries";
import { dpiaRecommended } from "@/lib/ropa";
import { requireOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Records of processing" };

const FILTERS: Record<string, { label: string; test: (a: ProcessingActivity) => boolean }> = {
  all: { label: "All", test: () => true },
  dpia: { label: "DPIA recommended", test: dpiaRecommended },
  sensitive: { label: "Sensitive data", test: (a) => a.sensitiveCategories.length > 0 },
  indirect: { label: "Collected from others", test: (a) => a.indirectCollection },
  "cross-border": { label: "Outside Kenya", test: (a) => a.crossBorder },
  automated: { label: "Automated decisions", test: (a) => a.automatedDecisions },
  marketing: { label: "Direct marketing", test: (a) => a.directMarketing },
};

export default async function RopaPage({ searchParams }: PageProps<"/ropa">) {
  const { org } = await requireOrgContext();
  const query = await searchParams;
  const raw = query.filter;
  const suggestion = suggestionFromQuery(query);
  const filter = typeof raw === "string" && raw in FILTERS ? raw : "all";
  const [all, dpias] = await Promise.all([listActivities(org.id), listDpias(org.id)]);
  const assessed = new Set(dpias.map((d) => d.dpia.activityId));
  const shown = all.filter(FILTERS[filter].test);

  return (
    <>
      <PageHeader
        title="Records of processing activities"
        description="The register of what personal data you process, why, and how you protect it. The ODPC can ask to see it at any time."
        actions={
          <>
            <Link href="/ropa/templates" className={buttonClass.secondary}>
              Add from templates
            </Link>
            <Link href="/ropa/new" className={buttonClass.primary}>
              New activity
            </Link>
          </>
        }
      />

      {suggestion && <ParticularsPrompt change={suggestion} />}

      {all.length === 0 ? (
        <EmptyState title="Your RoPA is empty">
          The quickest way to start is with the templates for your sector. Pick the ones that apply, then edit them.
          <div className="mt-4">
            <Link href="/ropa/templates" className={buttonClass.primary}>
              Browse templates
            </Link>
          </div>
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <nav className="flex flex-wrap gap-1" aria-label="Filter activities">
              {Object.entries(FILTERS).map(([key, f]) => (
                <Link
                  key={key}
                  href={key === "all" ? "/ropa" : `/ropa?filter=${key}`}
                  aria-current={filter === key ? "page" : undefined}
                  className={cx(
                    "rounded-full px-3 py-1 text-sm",
                    filter === key ? "bg-stone-900 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100",
                  )}
                >
                  {f.label} ({all.filter(f.test).length})
                </Link>
              ))}
            </nav>
            <div className="flex gap-3">
              <Link href="/ropa/notice" className={buttonClass.link}>
                Privacy notice
              </Link>
              <a href="/ropa/export.csv" className={buttonClass.link}>
                Export CSV
              </a>
              <Link href="/ropa/print" className={buttonClass.link}>
                Print / PDF
              </Link>
            </div>
          </div>

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600 uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Activity</th>
                  <th className="px-4 py-3 font-medium">Lawful basis</th>
                  <th className="px-4 py-3 font-medium">Data subjects</th>
                  <th className="px-4 py-3 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {shown.map((a) => (
                  <tr key={a.id} className="align-top hover:bg-stone-50">
                    <td className="px-4 py-3">
                      <Link href={`/ropa/${a.id}`} className="font-medium hover:underline">
                        {a.name}
                      </Link>
                      <p className="mt-0.5 line-clamp-2 text-stone-600">{a.purpose}</p>
                    </td>
                    <td className="px-4 py-3 text-stone-700">{LAWFUL_BASES[a.lawfulBasis as LawfulBasis]}</td>
                    <td className="px-4 py-3 text-stone-700">{a.dataSubjects.join(", ")}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {assessed.has(a.id) ? <Pill>DPIA done</Pill> : dpiaRecommended(a) && <Pill tone="amber">DPIA</Pill>}
                        {a.sensitiveCategories.length > 0 && <Pill tone="red">Sensitive</Pill>}
                        {a.indirectCollection && <Pill tone={indirectCollectionIssues(a).length > 0 ? "amber" : "stone"}>From others</Pill>}
                        {a.crossBorder && <Pill>Outside Kenya</Pill>}
                        {a.involvesChildren && <Pill>Children</Pill>}
                        {a.automatedDecisions && <Pill tone={automatedDecisionIssues(a).length > 0 ? "amber" : "stone"}>Automated decisions</Pill>}
                        {a.directMarketing && <Pill tone={directMarketingIssues(a).length > 0 ? "amber" : "stone"}>Marketing</Pill>}
                      </div>
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-stone-500">
                      No activities match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
