import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Card, EmptyState, PageHeader, PolicyStatusBadge } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { missingKinds, POLICY_KINDS, policyStatus, type PolicyKind } from "@/lib/policy";
import { listPolicies } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Policies" };

export default async function PoliciesPage() {
  const { org } = await requireOrgContext();
  const today = todayInKenya();
  const policies = await listPolicies(org.id);
  const rows = policies.map((p) => ({ ...p, status: policyStatus(p, today) }));
  const missing = missingKinds(policies);

  return (
    <>
      <PageHeader
        title="Policies"
        description="A register of your written data protection policies and procedures: what each one is, who approved it, where it is kept and when it is next reviewed. It shows an auditor or the ODPC that the documents exist and are kept up to date."
        actions={
          <Link href="/policies/new" className={buttonClass.primary}>
            Add a policy
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="No policies recorded">
          Start with your data protection policy. Add each document you have, even one still in draft, and say where it
          is kept. Kinga records the document and doesn&apos;t hold it.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Policy</th>
                <th className="px-4 py-3 font-medium">Responsible</th>
                <th className="px-4 py-3 font-medium">Approved</th>
                <th className="px-4 py-3 font-medium">Review</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((p) => (
                <tr key={p.id} className="align-top hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link href={`/policies/${p.id}`} className="font-medium hover:underline">
                      {p.title}
                    </Link>
                    <p className="mt-0.5 text-stone-600">
                      {POLICY_KINDS[p.kind as PolicyKind]}
                      {p.version && <> · Version {p.version}</>}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-stone-700">{p.owner || <span className="text-stone-500">—</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-stone-700">{formatDate(p.approvedOn)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-stone-700">{formatDate(p.reviewOn)}</td>
                  <td className="px-4 py-3">
                    <PolicyStatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {missing.length > 0 && (
        <>
          <h2 className="mt-10 mb-1 text-lg font-semibold">Not on record yet</h2>
          <p className="mb-4 max-w-2xl text-sm text-stone-600">
            Documents an organisation that handles personal data usually has. One document can cover several of these: if
            yours does, record it once under the kind that fits best.
          </p>
          <Card className="max-w-3xl p-0">
            <ul className="divide-y divide-stone-100">
              {missing.map((k) => (
                <li key={k} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span>{POLICY_KINDS[k]}</span>
                  <Link href={`/policies/new?kind=${k}`} className="font-medium text-brand-700 hover:underline">
                    Add it
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
