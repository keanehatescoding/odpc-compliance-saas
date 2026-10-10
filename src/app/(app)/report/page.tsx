import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { BackLink, buttonClass } from "@/components/ui";
import { REPORT_PERIOD_MONTHS, type ReportSection } from "@/lib/compliance-report";
import { formatDate } from "@/lib/dates";
import { SECTORS, type Sector } from "@/lib/dpa";
import { getComplianceReport } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Compliance report" };

export default async function ComplianceReportPage() {
  const { org } = await requireOrgContext();
  const report = await getComplianceReport(org, new Date());
  const withOpen = report.sections.filter((s) => s.open.length > 0);

  return (
    <div className="bg-white p-8 print:p-0">
      <div className="no-print mb-6 flex items-center justify-between">
        <BackLink href="/dashboard">Dashboard</BackLink>
        <PrintButton />
      </div>

      <article className="max-w-4xl">
        <header className="mb-8 border-b border-stone-300 pb-4">
          <p className="text-sm text-stone-600">Data protection compliance report · Data Protection Act, 2019</p>
          <h1 className="mt-1 text-2xl font-semibold">{org.name}</h1>
          <p className="mt-1 text-sm text-stone-600">
            {SECTORS[org.sector as Sector]}
            {org.kraPin && <> · KRA PIN {org.kraPin}</>} · Prepared {formatDate(report.preparedOn)}
          </p>
          <p className="mt-1 text-sm text-stone-600">
            Breaches, data subject requests and training are counted over the {REPORT_PERIOD_MONTHS} months from {formatDate(report.periodFrom)}.
          </p>
        </header>

        <section className="mb-8 break-inside-avoid">
          <h2 className="mb-2 text-lg font-semibold">Summary</h2>
          {withOpen.length === 0 ? (
            <p className="text-sm">The records show nothing missing, late or due in any area.</p>
          ) : (
            <>
              <p className="text-sm">
                The records show {report.openCount} open {report.openCount === 1 ? "item" : "items"}, in{" "}
                {withOpen.length === 1 ? "one area" : `${withOpen.length} of ${report.sections.length} areas`}.
              </p>
              <table className="mt-3 w-full border-collapse text-left text-sm">
                <tbody>
                  {report.sections.map((s) => (
                    <tr key={s.key} className="border-b border-stone-200">
                      <td className="py-1.5 pr-3">{s.heading}</td>
                      <td className={`py-1.5 text-right ${s.open.length > 0 ? "font-medium text-amber-800" : "text-stone-600"}`}>
                        {s.open.length === 0 ? "Nothing open" : `${s.open.length} open`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        {report.sections.map((s, i) => (
          <Section key={s.key} section={s} number={i + 1} />
        ))}

        <p className="mt-8 border-t border-stone-300 pt-4 text-xs text-stone-500">
          Written by Kinga from the records {org.name} keeps in it, as they stood on {formatDate(report.preparedOn)}. It reports
          what has been recorded and isn&apos;t a legal opinion or a finding that the organisation complies with the Act.
        </p>
      </article>
    </div>
  );
}

function Section({ section: s, number }: { section: ReportSection; number: number }) {
  return (
    <section className="mb-8">
      <div className="mb-2 break-after-avoid">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold">
            {number}. {s.heading}
          </h2>
          <Link href={s.href} className={`no-print ${buttonClass.link}`}>
            Open
          </Link>
        </div>
        <p className="text-xs text-stone-500">{s.basis}</p>
      </div>

      {s.facts.length > 0 && (
        <dl className="grid grid-cols-[16rem_1fr] gap-x-4 gap-y-1 text-sm">
          {s.facts.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-stone-600">{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {s.table && (
        <table className="mt-3 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-stone-300 text-xs text-stone-600 uppercase">
              {s.table.columns.map((c) => (
                <th key={c} className="py-2 pr-3 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.table.rows.map((row, r) => (
              <tr key={r} className="break-inside-avoid border-b border-stone-200 align-top">
                {row.map((cell, c) => (
                  <td key={c} className="py-2 pr-3">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-3 break-inside-avoid text-sm">
        {s.open.length === 0 ? (
          <p className="text-stone-600">Nothing open.</p>
        ) : (
          <>
            <p className="font-medium">Open</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {s.open.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
