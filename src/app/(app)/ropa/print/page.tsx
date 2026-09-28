import type { Metadata } from "next";
import { BackLink } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { formatDate, todayInKenya } from "@/lib/dates";
import { listActivities } from "@/lib/queries";
import { ROPA_COLUMNS, type ActivityInput } from "@/lib/ropa";
import { requireOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Record of Processing Activities" };

export default async function PrintRopaPage() {
  const { org } = await requireOrgContext();
  const activities = (await listActivities(org.id)) as ActivityInput[];
  const [nameCol, ...rest] = ROPA_COLUMNS;

  return (
    <div className="bg-white p-8 print:p-0">
      <div className="no-print mb-6 flex items-center justify-between">
        <BackLink href="/ropa">Records of processing</BackLink>
        <PrintButton />
      </div>
      <header className="mb-8 border-b border-stone-300 pb-4">
        <p className="text-sm text-stone-600">Record of Processing Activities</p>
        <h1 className="text-2xl font-semibold">{org.name}</h1>
        <p className="mt-1 text-sm text-stone-600">
          {org.kraPin && <>KRA PIN {org.kraPin} · </>}Prepared {formatDate(todayInKenya())} · {activities.length} activities
        </p>
      </header>
      {activities.map((a, i) => (
        <section key={i} className="mb-8 break-inside-avoid">
          <h2 className="mb-2 text-lg font-semibold">
            {i + 1}. {nameCol.value(a)}
          </h2>
          <dl className="grid grid-cols-[12rem_1fr] gap-x-4 gap-y-1 text-sm">
            {rest.map((c) => {
              const v = c.value(a);
              return v ? (
                <div key={c.header} className="contents">
                  <dt className="text-stone-600">{c.header}</dt>
                  <dd>{v}</dd>
                </div>
              ) : null;
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}
