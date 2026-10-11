import type { Metadata } from "next";
import Link from "next/link";
import { BackLink, buttonClass, EmptyState, PageHeader } from "@/components/ui";
import { listActivities } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { ConsentForm } from "../consent-form";

export const metadata: Metadata = { title: "Add a consent record" };

export default async function NewConsentPage({ searchParams }: PageProps<"/consents/new">) {
  const { org } = await requireOrgContext();
  const [activities, query] = await Promise.all([listActivities(org.id), searchParams]);
  const wanted = typeof query.activity === "string" ? query.activity : null;
  return (
    <>
      <BackLink href="/consents">Consent records</BackLink>
      <PageHeader
        title="Add a consent record"
        description="Add it even if you can't fill everything in yet. Kinga will show what's missing."
      />
      {activities.length === 0 ? (
        <EmptyState title="Add the processing activity first">
          <p>A consent record belongs to an activity in your Records of processing. Add the activity, then come back.</p>
          <p className="mt-4">
            <Link href="/ropa/templates" className={buttonClass.secondary}>
              Records of processing
            </Link>
          </p>
        </EmptyState>
      ) : (
        <ConsentForm
          activities={activities.map((a) => ({ id: a.id, name: a.name }))}
          activityId={activities.find((a) => a.id === wanted)?.id}
        />
      )}
    </>
  );
}
