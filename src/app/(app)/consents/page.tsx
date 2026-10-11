import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Card, ConsentStatusBadge, EmptyState, PageHeader, Pill } from "@/components/ui";
import { activitiesWithoutConsent, CONSENT_METHODS, consentStatus, type ConsentMethod } from "@/lib/consent";
import { formatDate, todayInKenya } from "@/lib/dates";
import { listActivities, listConsentRecords } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Consent records" };

export default async function ConsentsPage() {
  const { org } = await requireOrgContext();
  const today = todayInKenya();
  const [consents, activities] = await Promise.all([listConsentRecords(org.id), listActivities(org.id)]);
  const activityName = new Map(activities.map((a) => [a.id, a.name]));
  const uncovered = activitiesWithoutConsent(activities, consents);

  return (
    <>
      <PageHeader
        title="Consent records"
        description="Where you rely on consent, section 32 of the Act says it is for you to prove it was given. Record what you ask, how people agree, where the proof is kept and how they withdraw."
        actions={
          <Link href="/consents/new" className={buttonClass.primary}>
            Add a consent record
          </Link>
        }
      />

      {uncovered.length > 0 && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <h2 className="font-semibold">Activities that rely on consent with no record</h2>
          <ul className="mt-2 divide-y divide-amber-200">
            {uncovered.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/ropa/${a.id}`} className="font-medium hover:underline">
                  {a.name}
                </Link>
                <Link href={`/consents/new?activity=${a.id}`} className={buttonClass.secondary}>
                  Record the consent
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {consents.length === 0 ? (
        <EmptyState title="No consent records">
          Think of everything you ask people to agree to before you use their data: marketing messages, photographs,
          newsletters, sharing with a partner, a loyalty scheme. Each one needs wording you can point to and proof you can
          find. Processing you do under a contract or because the law requires it doesn&apos;t need consent.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Consent</th>
                <th className="px-4 py-3 font-medium">How it&apos;s given</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {consents.map((c) => (
                <tr key={c.id} className="align-top hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link href={`/consents/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <p className="mt-0.5 text-stone-600">
                      {c.activityId ? activityName.get(c.activityId) : "Not linked to a processing activity"}
                    </p>
                    {c.parental && (
                      <p className="mt-1">
                        <Pill>Parent or guardian</Pill>
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-700">
                    {CONSENT_METHODS[c.method as ConsentMethod]}
                    {c.collection && <p className="mt-0.5 line-clamp-2 text-xs text-stone-600">{c.collection}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <ConsentStatusBadge status={consentStatus(c, today)} />
                    {c.reviewOn && <p className="mt-1 text-xs text-stone-600">Review {formatDate(c.reviewOn)}</p>}
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
