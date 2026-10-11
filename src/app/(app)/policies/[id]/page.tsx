import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deletePolicy } from "@/app/actions/policies";
import { RecordHistory } from "@/components/activity-list";
import { DeleteButton } from "@/components/delete-button";
import { BackLink, Card, cx, PageHeader, PolicyStatusBadge } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { daysToPolicyReview, POLICY_CONTENTS, POLICY_KINDS, policyGaps, policyStatus, type PolicyKind } from "@/lib/policy";
import { listPolicies } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { PolicyForm } from "../policy-form";

export const metadata: Metadata = { title: "Policy" };

export default async function PolicyPage({ params }: PageProps<"/policies/[id]">) {
  const { id } = await params;
  const { org } = await requireOrgContext();
  const policy = isUuid(id) ? (await listPolicies(org.id)).find((p) => p.id === id) : undefined;
  if (!policy) notFound();

  const today = todayInKenya();
  const status = policyStatus(policy, today);
  const gaps = policyGaps(policy);
  const reviewIn = daysToPolicyReview(policy, today);

  return (
    <>
      <BackLink href="/policies">Policies</BackLink>
      <PageHeader
        title={policy.title}
        description={POLICY_KINDS[policy.kind as PolicyKind]}
        actions={<DeleteButton action={deletePolicy.bind(null, policy.id)} />}
      />

      <Card className={cx("mb-6 max-w-3xl", status === "review_due" && "border-amber-300 bg-amber-50")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PolicyStatusBadge status={status} />
          {policy.approvedOn && <p className="text-sm text-stone-700">Approved {formatDate(policy.approvedOn)}</p>}
        </div>
        {status === "review_due" && (
          <p className="mt-3 text-sm text-stone-700">
            This was due for review on <strong>{formatDate(policy.reviewOn)}</strong>. Check it still matches what you do,
            have any changes approved, then set the new approval and review dates.
          </p>
        )}
        {status === "in_place" && reviewIn !== null && (
          <p className="mt-3 text-sm text-stone-700">
            Next review on {formatDate(policy.reviewOn)}, in {reviewIn} {reviewIn === 1 ? "day" : "days"}.
          </p>
        )}
        {gaps.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-stone-700">
            {gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        )}
        {policy.kind === "data_protection" && (
          <details className="mt-3 text-sm text-stone-700">
            <summary className="cursor-pointer font-medium">What a data protection policy usually covers</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {POLICY_CONTENTS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-stone-600">A checklist, not legal advice.</p>
          </details>
        )}
      </Card>

      <PolicyForm policy={policy} today={today} />
      <RecordHistory orgId={org.id} subjectId={policy.id} />
    </>
  );
}
