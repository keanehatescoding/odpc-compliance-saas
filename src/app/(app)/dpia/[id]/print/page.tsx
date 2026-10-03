import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { BackLink, RiskLevelBadge } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { DPIA_STATUS_LABEL, dpiaStatus, LIKELIHOODS, riskLevel, SEVERITIES, type Likelihood, type Severity } from "@/lib/dpia";
import { getActivity, getDpia, listDpiaRisks } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

export const metadata: Metadata = { title: "Data Protection Impact Assessment" };

const NOT_RECORDED = "Not recorded.";

export default async function PrintDpiaPage({ params }: PageProps<"/dpia/[id]/print">) {
  const { id } = await params;
  const { org } = await requireOrgContext();
  const dpia = isUuid(id) ? await getDpia(org.id, id) : null;
  if (!dpia) notFound();
  const [risks, activity] = await Promise.all([
    listDpiaRisks(dpia.id),
    dpia.activityId ? getActivity(org.id, dpia.activityId) : null,
  ]);
  const status = dpiaStatus(dpia, todayInKenya());

  const text = (heading: string, body: string) => (
    <section className="mb-6 break-inside-avoid">
      <h2 className="mb-1 font-semibold">{heading}</h2>
      <p className={`text-sm whitespace-pre-line ${body ? "" : "text-stone-500"}`}>{body || NOT_RECORDED}</p>
    </section>
  );
  const level = (l: string, s: string) => (
    <span className="whitespace-nowrap">
      <RiskLevelBadge level={riskLevel(l, s)} />
      <span className="mt-1 block text-xs text-stone-600">
        {LIKELIHOODS[l as Likelihood]} / {SEVERITIES[s as Severity]}
      </span>
    </span>
  );

  return (
    <div className="bg-white p-8 print:p-0">
      <div className="no-print mb-6 flex items-center justify-between">
        <BackLink href={`/dpia/${dpia.id}`}>Back to DPIA</BackLink>
        <PrintButton />
      </div>

      <article className="max-w-4xl">
        <header className="mb-8 border-b border-stone-300 pb-4">
          <p className="text-sm text-stone-600">Data Protection Impact Assessment · section 31, Data Protection Act, 2019</p>
          <h1 className="mt-1 text-2xl font-semibold">{dpia.title}</h1>
          <p className="mt-1 text-sm text-stone-600">
            {org.name}
            {activity && <> · RoPA activity: {activity.name}</>} · {DPIA_STATUS_LABEL[status]} · Printed {formatDate(todayInKenya())}
          </p>
          {dpia.assessor && <p className="mt-1 text-sm text-stone-600">Prepared by {dpia.assessor}</p>}
        </header>

        {text("1. Description of the processing", dpia.description)}
        {text("Purposes", dpia.purposes)}
        {text("2. Necessity and proportionality", dpia.necessity)}
        {text("Consultation", dpia.consultation)}

        <section className="mb-6">
          <h2 className="mb-2 font-semibold">3. Risks to data subjects and measures to address them</h2>
          {risks.length === 0 ? (
            <p className="text-sm text-stone-500">{NOT_RECORDED}</p>
          ) : (
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-xs text-stone-600 uppercase">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">Risk</th>
                  <th className="py-2 pr-3 font-medium">Before</th>
                  <th className="py-2 pr-3 font-medium">Measures</th>
                  <th className="py-2 font-medium">After</th>
                </tr>
              </thead>
              <tbody>
                {risks.map((r, i) => (
                  <tr key={r.id} className="break-inside-avoid border-b border-stone-200 align-top">
                    <td className="py-2 pr-3">{i + 1}</td>
                    <td className="py-2 pr-3">{r.description}</td>
                    <td className="py-2 pr-3">{level(r.likelihood, r.severity)}</td>
                    <td className="py-2 pr-3 whitespace-pre-line">{r.mitigation || <span className="text-stone-500">None recorded</span>}</td>
                    <td className="py-2">{level(r.residualLikelihood, r.residualSeverity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {text("4. Conclusion", dpia.conclusion)}

        <section className="break-inside-avoid">
          <h2 className="mb-2 font-semibold">Sign-off</h2>
          <dl className="grid grid-cols-[12rem_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-stone-600">Approved by</dt>
            <dd>{dpia.approvedBy || "—"}</dd>
            <dt className="text-stone-600">Approved on</dt>
            <dd>{formatDate(dpia.approvedOn)}</dd>
            <dt className="text-stone-600">Next review</dt>
            <dd>{formatDate(dpia.reviewOn)}</dd>
            {dpia.odpcConsultedOn && (
              <>
                <dt className="text-stone-600">ODPC consulted on</dt>
                <dd>{formatDate(dpia.odpcConsultedOn)}</dd>
              </>
            )}
          </dl>
        </section>
      </article>
    </div>
  );
}
