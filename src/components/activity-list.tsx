import Link from "next/link";
import { db } from "@/db";
import { subjectHistory, type ActivityRow } from "@/lib/activity";
import { formatDateTime } from "@/lib/dates";
import { Card } from "./ui";

/** Activity log entries, newest first. `links` maps an entry's id to its record's page. */
export function ActivityList({ rows, links }: { rows: ActivityRow[]; links?: Map<string, string> }) {
  return (
    <ol className="divide-y divide-stone-100">
      {rows.map((r) => {
        const href = links?.get(r.id);
        return (
          <li key={r.id} className="py-3 text-sm">
            <p className="text-xs text-stone-500">{formatDateTime(r.createdAt)}</p>
            <p className="mt-0.5">
              <span className="font-medium">{r.actorName || "Someone"}</span> {r.summary}.
              {href && (
                <>
                  {" "}
                  <Link href={href} className="font-medium text-brand-700 hover:underline">
                    View
                  </Link>
                </>
              )}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/** Who changed one record, and when. Shown at the foot of the record's page. */
export async function RecordHistory({ orgId, subjectId }: { orgId: string; subjectId: string }) {
  const rows = await subjectHistory(db, orgId, subjectId);
  return (
    <Card className="no-print mt-6 max-w-3xl">
      <h2 className="font-semibold">History</h2>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-stone-600">No changes recorded yet.</p>
      ) : (
        <div className="mt-2 border-t border-stone-100">
          <ActivityList rows={rows} />
        </div>
      )}
    </Card>
  );
}
