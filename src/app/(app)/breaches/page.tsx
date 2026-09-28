import type { Metadata } from "next";
import Link from "next/link";
import { Countdown } from "@/components/countdown";
import { BreachStatusBadge, buttonClass, Card, EmptyState, PageHeader } from "@/components/ui";
import { BREACH_KINDS, breachStatus, notificationDeadline, type BreachKind } from "@/lib/breach";
import { formatDateTime } from "@/lib/dates";
import { listBreaches } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Data breaches" };

export default async function BreachesPage() {
  const { org } = await requireOrgContext();
  const now = new Date();
  const rows = (await listBreaches(org.id)).map((b) => ({ ...b, status: breachStatus(b, now) }));

  return (
    <>
      <PageHeader
        title="Data breaches"
        description="Log every personal data breach, even minor ones. If there is a real risk of harm, you must notify the ODPC within 72 hours of becoming aware of it (s.43)."
        actions={
          <Link href="/breaches/new" className={buttonClass.danger}>
            Log a breach
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="No breaches logged">
          When something goes wrong, such as a lost laptop, a message sent to the wrong group or a hacked account, log it here
          straight away. The 72-hour clock starts when you become aware.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Breach</th>
                <th className="px-4 py-3 font-medium">Became aware</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((b) => (
                <tr key={b.id} className="align-top hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link href={`/breaches/${b.id}`} className="font-medium hover:underline">
                      {b.title}
                    </Link>
                    <p className="mt-0.5 text-stone-600">{BREACH_KINDS[b.kind as BreachKind]}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-stone-700">{formatDateTime(b.discoveredAt)}</td>
                  <td className="px-4 py-3">
                    <BreachStatusBadge status={b.status} />
                    {(b.status === "open" || b.status === "overdue") && (
                      <p className={`mt-1 text-xs ${b.status === "overdue" ? "text-red-700" : "text-orange-800"}`}>
                        <Countdown deadline={notificationDeadline(b).toISOString()} now={now.toISOString()} />
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
