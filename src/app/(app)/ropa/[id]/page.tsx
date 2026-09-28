import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteActivity } from "@/app/actions/ropa";
import { DeleteButton } from "@/components/delete-button";
import { BackLink, Card, PageHeader } from "@/components/ui";
import { getActivity } from "@/lib/queries";
import { dpiaRecommended, dpiaTriggers } from "@/lib/ropa";
import { requireOrgContext } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { ActivityForm } from "../activity-form";

export const metadata: Metadata = { title: "Edit processing activity" };

export default async function EditActivityPage({ params }: PageProps<"/ropa/[id]">) {
  const { id } = await params;
  const { org } = await requireOrgContext();
  const activity = isUuid(id) ? await getActivity(org.id, id) : null;
  if (!activity) notFound();
  const triggers = dpiaTriggers(activity);

  return (
    <>
      <BackLink href="/ropa">Records of processing</BackLink>
      <PageHeader title={activity.name} actions={<DeleteButton action={deleteActivity.bind(null, activity.id)} />} />
      {triggers.length > 0 && (
        <Card className={`mb-6 max-w-3xl ${dpiaRecommended(activity) ? "border-amber-300 bg-amber-50" : ""}`}>
          <h2 className="font-semibold">
            {dpiaRecommended(activity) ? "A DPIA is recommended for this activity" : "Risk factors"}
          </h2>
          <ul className="mt-2 list-disc pl-5 text-sm text-stone-700">
            {triggers.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          {dpiaRecommended(activity) && (
            <p className="mt-3 text-xs text-stone-600">
              Section 31 of the Data Protection Act requires a DPIA before processing that is likely to result in high risk to
              people&apos;s rights. This is a screening prompt, not a legal determination.
            </p>
          )}
        </Card>
      )}
      <ActivityForm activity={activity} />
    </>
  );
}
