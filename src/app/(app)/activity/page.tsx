import type { Metadata } from "next";
import Link from "next/link";
import { ActivityList } from "@/components/activity-list";
import { Card, cx, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db";
import type { ActivityArea } from "@/db/schema";
import { ACTIVITY_AREAS, listActivity, subjectLinks } from "@/lib/activity";
import { requireOrgContext } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

export const metadata: Metadata = { title: "Activity" };

const href = (area: string | null, before?: string) => {
  const q = new URLSearchParams();
  if (area) q.set("area", area);
  if (before) q.set("before", before);
  return q.size > 0 ? `/activity?${q}` : "/activity";
};

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const { org } = await requireOrgContext();
  const { area: rawArea, before: rawBefore } = await searchParams;
  const area = typeof rawArea === "string" && rawArea in ACTIVITY_AREAS ? (rawArea as ActivityArea) : null;
  const before = typeof rawBefore === "string" && isUuid(rawBefore) ? rawBefore : undefined;

  const { rows, more } = await listActivity(db, org.id, { area: area ?? undefined, before });
  const links = await subjectLinks(db, org.id, rows);

  return (
    <>
      <PageHeader
        title="Activity"
        description="Who changed what, and when, across your records, team and settings. Kept as long as the organisation is, so you can show the ODPC how you've met your obligations."
      />

      <nav className="mb-4 flex flex-wrap gap-1" aria-label="Filter activity">
        {([null, ...Object.keys(ACTIVITY_AREAS)] as (ActivityArea | null)[]).map((key) => (
          <Link
            key={key ?? "all"}
            href={href(key)}
            aria-current={area === key ? "page" : undefined}
            className={cx(
              "rounded-full px-3 py-1 text-sm",
              area === key ? "bg-stone-900 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100",
            )}
          >
            {key ? ACTIVITY_AREAS[key] : "All"}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState title={before ? "No older activity" : "No activity yet"}>
          Changes anyone in your team makes to registrations, records, the team or settings appear here.
        </EmptyState>
      ) : (
        <Card className="py-2">
          <ActivityList rows={rows} links={links} />
        </Card>
      )}

      {(more || before) && (
        <div className="mt-4 flex gap-4">
          {before && (
            <Link href={href(area)} className="text-sm font-medium text-brand-700 hover:underline">
              Newest
            </Link>
          )}
          {more && (
            <Link href={href(area, rows[rows.length - 1].id)} className="text-sm font-medium text-brand-700 hover:underline">
              Older
            </Link>
          )}
        </div>
      )}
    </>
  );
}
