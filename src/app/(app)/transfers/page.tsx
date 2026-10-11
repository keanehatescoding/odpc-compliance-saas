import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Card, EmptyState, PageHeader, TransferStatusBadge } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { listActivities, listTransfers } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { activitiesWithoutTransfer, TRANSFER_BASES, transferStatus, type TransferBasis } from "@/lib/transfer";

export const metadata: Metadata = { title: "Transfers outside Kenya" };

export default async function TransfersPage() {
  const { org } = await requireOrgContext();
  const today = todayInKenya();
  const [transfers, activities] = await Promise.all([listTransfers(org.id), listActivities(org.id)]);
  const activityName = new Map(activities.map((a) => [a.id, a.name]));
  const uncovered = activitiesWithoutTransfer(activities, transfers);

  return (
    <>
      <PageHeader
        title="Transfers outside Kenya"
        description="Section 48 of the Act lets personal data leave Kenya only with appropriate safeguards or where the transfer is necessary, and section 49 adds consent for sensitive data. Each record says who receives the data, where, and what the transfer relies on."
        actions={
          <Link href="/transfers/new" className={buttonClass.primary}>
            Add a transfer
          </Link>
        }
      />

      {uncovered.length > 0 && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <h2 className="font-semibold">Activities that send data outside Kenya with no transfer record</h2>
          <ul className="mt-2 divide-y divide-amber-200">
            {uncovered.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <Link href={`/ropa/${a.id}`} className="font-medium hover:underline">
                    {a.name}
                  </Link>
                  {a.transferCountries && <span className="text-stone-600"> · {a.transferCountries}</span>}
                </span>
                <Link href={`/transfers/new?activity=${a.id}`} className={buttonClass.secondary}>
                  Record it
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {transfers.length === 0 ? (
        <EmptyState title="No transfers">
          Personal data leaves Kenya more often than it seems: email and file storage hosted abroad, a school or clinic
          system in the cloud, a bulk SMS or newsletter service, a payroll provider, a parent company. Each needs something
          that makes it lawful.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Recipient</th>
                <th className="px-4 py-3 font-medium">Countries</th>
                <th className="px-4 py-3 font-medium">Relies on</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {transfers.map((t) => (
                <tr key={t.id} className="align-top hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link href={`/transfers/${t.id}`} className="font-medium hover:underline">
                      {t.recipient}
                    </Link>
                    <p className="mt-0.5 text-stone-600">
                      {t.activityId ? activityName.get(t.activityId) : "Not linked to a processing activity"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-stone-700">{t.countries || "—"}</td>
                  <td className="px-4 py-3 text-stone-700">{TRANSFER_BASES[t.basis as TransferBasis]}</td>
                  <td className="px-4 py-3">
                    <TransferStatusBadge status={transferStatus(t, today)} />
                    {t.reviewOn && <p className="mt-1 text-xs text-stone-600">Review {formatDate(t.reviewOn)}</p>}
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
