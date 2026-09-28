import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Card, cx, EmptyState, PageHeader, Pill } from "@/components/ui";
import type { ProcessingActivity } from "@/db/schema";
import { LAWFUL_BASES, type LawfulBasis } from "@/lib/dpa";
import { listActivities } from "@/lib/queries";
import { dpiaRecommended } from "@/lib/ropa";
import { requireOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Records of processing" };

const FILTERS: Record<string, { label: string; test: (a: ProcessingActivity) => boolean }> = {
  all: { label: "All", test: () => true },
  dpia: { label: "DPIA recommended", test: dpiaRecommended },
  sensitive: { label: "Sensitive data", test: (a) => a.sensitiveCategories.length > 0 },
  "cross-border": { label: "Outside Kenya", test: (a) => a.crossBorder },
};

export default async function RopaPage({ searchParams }: PageProps<"/ropa">) {
  const { org } = await requireOrgContext();
  const { filter: raw } = await searchParams;
  const filter = typeof raw === "string" && raw in FILTERS ? raw : "all";
  const all = await listActivities(org.id);
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
                        {dpiaRecommended(a) && <Pill tone="amber">DPIA</Pill>}
                        {a.sensitiveCategories.length > 0 && <Pill tone="red">Sensitive</Pill>}
                        {a.crossBorder && <Pill>Outside Kenya</Pill>}
                        {a.involvesChildren && <Pill>Children</Pill>}
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
