import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Card, EmptyState, PageHeader, Pill, ProcessorStatusBadge } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { processorStatus } from "@/lib/processor";
import { listProcessorLinks, listProcessors } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Processors" };

export default async function ProcessorsPage() {
  const { org } = await requireOrgContext();
  const today = todayInKenya();
  const [processors, links] = await Promise.all([listProcessors(org.id), listProcessorLinks(org.id)]);
  const rows = processors.map((p) => ({
    ...p,
    status: processorStatus(p, today),
    activities: links.filter((l) => l.processorId === p.id).length,
  }));

  return (
    <>
      <PageHeader
        title="Processors"
        description="The suppliers and service providers that handle personal data for you, such as a payroll bureau, a management system or a cloud host. Section 42 of the Act says you must choose ones that keep it secure, and have a written contract with each."
        actions={
          <Link href="/processors/new" className={buttonClass.primary}>
            Add a processor
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="No processors listed">
          Think of anyone outside your organisation who stores or works with the personal data you collect: software
          vendors, bulk SMS and email services, accountants, payroll and HR providers, CCTV and security firms, cloud
          storage. You stay responsible for what they do with it.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Processor</th>
                <th className="px-4 py-3 font-medium">Activities</th>
                <th className="px-4 py-3 font-medium">Contract</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((p) => (
                <tr key={p.id} className="align-top hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link href={`/processors/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <p className="mt-0.5 line-clamp-2 text-stone-600">{p.service}</p>
                    {p.outsideKenya && (
                      <p className="mt-1">
                        <Pill>Outside Kenya</Pill>
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-700 tabular-nums">{p.activities}</td>
                  <td className="px-4 py-3">
                    <ProcessorStatusBadge status={p.status} />
                    {p.contractSignedOn && (
                      <p className="mt-1 text-xs text-stone-600">
                        Signed {formatDate(p.contractSignedOn)}
                        {p.contractReviewOn && ` · review ${formatDate(p.contractReviewOn)}`}
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
