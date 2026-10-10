import type { Metadata } from "next";
import Link from "next/link";
import { Card, cx, EmptyState, PageHeader, Pill } from "@/components/ui";
import { db } from "@/db";
import { formatDate, todayInKenya } from "@/lib/dates";
import { SECTORS, type Sector } from "@/lib/dpa";
import { requireStaff } from "@/lib/session";
import { matchesFilter, ORG_FILTERS, orgSummaries, overview, TRIAL_ENDING_DAYS, type OrgFilter } from "@/lib/staff";
import { AccessBadge } from "../access-badge";

export const metadata: Metadata = { title: "Organisations" };

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-stone-500">{hint}</p>}
    </Card>
  );
}

export default async function OrganisationsPage({ searchParams }: PageProps<"/staff/organisations">) {
  await requireStaff();
  const { show } = await searchParams;
  const filter: OrgFilter = typeof show === "string" && show in ORG_FILTERS ? (show as OrgFilter) : "all";
  const summaries = await orgSummaries(db);
  const totals = overview(summaries);
  const shown = summaries.filter((s) => matchesFilter(s, filter));

  return (
    <>
      <PageHeader
        title="Organisations"
        description="How each organisation is getting on. You see their team and billing, and how many records they keep, but not the records themselves."
      />
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="On trial" value={totals.trial} hint={`${totals.trialEnding} ending within ${TRIAL_ENDING_DAYS} days`} />
          <Stat label="Paying" value={totals.active} hint={`${totals.autoRenew} renewing automatically`} />
          <Stat label="Lapsed" value={totals.lapsed} />
          <Stat label="Total" value={totals.trial + totals.active + totals.lapsed} />
        </div>

        <nav className="flex flex-wrap gap-2 text-sm" aria-label="Filter organisations">
          {(Object.keys(ORG_FILTERS) as OrgFilter[]).map((key) => (
            <Link
              key={key}
              href={key === "all" ? "/staff/organisations" : `/staff/organisations?show=${key}`}
              aria-current={filter === key ? "page" : undefined}
              className={cx(
                "rounded-full px-3 py-1 font-medium",
                filter === key ? "bg-brand-600 text-white" : "bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100",
              )}
            >
              {ORG_FILTERS[key]}
            </Link>
          ))}
        </nav>

        {shown.length === 0 ? (
          <EmptyState title="No organisations here." />
        ) : (
          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-stone-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Organisation</th>
                    <th className="px-4 py-2 font-medium">Signed up</th>
                    <th className="px-4 py-2 font-medium">Access</th>
                    <th className="px-4 py-2 font-medium">Owner</th>
                    <th className="px-4 py-2 text-right font-medium" title="Team members">
                      Team
                    </th>
                    <th className="px-4 py-2 font-medium">Records</th>
                    <th className="px-4 py-2 font-medium">Last change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {shown.map((s) => {
                    const owner = s.owners[0];
                    return (
                      <tr key={s.org.id} className="align-top">
                        <td className="px-4 py-3">
                          <Link href={`/staff/organisations/${s.org.id}`} className="font-medium hover:underline">
                            {s.org.name}
                          </Link>
                          <span className="block text-xs text-stone-500">{SECTORS[s.org.sector as Sector]}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatDate(todayInKenya(s.org.createdAt))}</td>
                        <td className="px-4 py-3">
                          <AccessBadge access={s.access} deletedAt={s.org.deletedAt} />
                          {s.org.autoRenewInterval && <span className="block text-xs text-stone-500">Renews automatically</span>}
                        </td>
                        <td className="px-4 py-3">
                          {owner ? (
                            <>
                              {owner.name}
                              <span className="block text-xs text-stone-500">
                                {owner.email}
                                {!owner.verified && (
                                  <>
                                    {" "}
                                    <Pill tone="amber">unconfirmed</Pill>
                                  </>
                                )}
                              </span>
                              {s.owners.length > 1 && <span className="text-xs text-stone-500">and {s.owners.length - 1} more</span>}
                            </>
                          ) : (
                            <span className="text-stone-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">{s.teamSize}</td>
                        <td className="px-4 py-3">
                          <RecordCountsLine counts={s.counts} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {s.lastChangeAt ? formatDate(todayInKenya(s.lastChangeAt)) : <Pill tone="amber">Nothing yet</Pill>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

const SHORT_LABELS = { registrations: "reg", ropa: "RoPA", dpias: "DPIA", breaches: "breach", requests: "req" } as const;

/** E.g. "2 reg · 5 RoPA · 1 DPIA", leaving out kinds with none. */
function RecordCountsLine({ counts }: { counts: Record<keyof typeof SHORT_LABELS, number> }) {
  const parts = (Object.keys(SHORT_LABELS) as (keyof typeof SHORT_LABELS)[]).filter((k) => counts[k] > 0);
  if (parts.length === 0) return <span className="text-stone-500">None</span>;
  return (
    <span className="text-xs whitespace-nowrap text-stone-700">
      {parts.map((k) => `${counts[k]} ${SHORT_LABELS[k]}`).join(" · ")}
    </span>
  );
}
