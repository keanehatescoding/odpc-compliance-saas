import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteDpia } from "@/app/actions/dpia";
import { DeleteButton } from "@/components/delete-button";
import { BackLink, buttonClass, Card, cx, DpiaStatusBadge, FormMessage, PageHeader } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { approvalBlockers, consultationRequired, dpiaStatus, type RiskInput } from "@/lib/dpia";
import { getDpia, listActivities, listDpiaRisks } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { DpiaForm } from "../dpia-form";

export const metadata: Metadata = { title: "DPIA" };

export default async function DpiaPage({ params, searchParams }: PageProps<"/dpia/[id]">) {
  const { id } = await params;
  const saved = (await searchParams).saved === "1";
  const { org } = await requireOrgContext();
  const dpia = isUuid(id) ? await getDpia(org.id, id) : null;
  if (!dpia) notFound();
  const [risks, activities] = await Promise.all([listDpiaRisks(dpia.id), listActivities(org.id)]);

  const status = dpiaStatus(dpia, todayInKenya());
  const blockers = approvalBlockers({ ...dpia, risks: risks as RiskInput[] });
  const consult = consultationRequired(risks);

  return (
    <>
      <BackLink href="/dpia">Impact assessments</BackLink>
      <PageHeader
        title={dpia.title}
        description="Data protection impact assessment"
        actions={
          <>
            <Link href={`/dpia/${dpia.id}/print`} className={buttonClass.secondary}>
              Print / PDF
            </Link>
            <DeleteButton action={deleteDpia.bind(null, dpia.id)} />
          </>
        }
      />

      {saved && (
        <div className="mb-4 max-w-3xl">
          <FormMessage tone="success" message="DPIA saved." />
        </div>
      )}

      <Card
        className={cx(
          "mb-6 max-w-3xl",
          status === "review_due" && "border-amber-300 bg-amber-50",
          consult && !dpia.odpcConsultedOn && "border-red-300 bg-red-50",
        )}
      >
        <DpiaStatusBadge status={status} />
        <p className="mt-3 text-sm text-stone-700">
          {status === "draft" ? (
            blockers.length === 0 ? (
              "Ready for sign-off. Record the approval date below."
            ) : (
              "To approve this DPIA:"
            )
          ) : (
            <>
              Approved by {dpia.approvedBy} on {formatDate(dpia.approvedOn)}. {status === "review_due" ? "Review was due" : "Review by"}{" "}
              {formatDate(dpia.reviewOn)}
              {status === "review_due" && ". Check it still reflects the processing, then set a new review date"}.
            </>
          )}
        </p>
        {status === "draft" && blockers.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm text-stone-800">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
        {consult && (
          <p className="mt-3 text-sm text-stone-700">
            {dpia.odpcConsultedOn
              ? `High risk remains after mitigation. The ODPC was consulted on ${formatDate(dpia.odpcConsultedOn)}.`
              : "High risk remains after mitigation. Section 31 requires you to consult the ODPC before the processing starts, unless further measures bring the risk down."}
          </p>
        )}
      </Card>

      <DpiaForm dpia={dpia} risks={risks} activities={activities.map(({ id, name }) => ({ id, name }))} />
    </>
  );
}
