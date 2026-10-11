import type { Metadata } from "next";
import Link from "next/link";
import { BackLink, buttonClass, EmptyState, PageHeader } from "@/components/ui";
import { listActivities } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { LiaForm } from "../lia-form";

export const metadata: Metadata = { title: "Add a legitimate interest assessment" };

export default async function NewLiaPage({ searchParams }: PageProps<"/lia/new">) {
  const { org } = await requireOrgContext();
  const [activities, query] = await Promise.all([listActivities(org.id), searchParams]);
  const wanted = typeof query.activity === "string" ? query.activity : null;
  const activity = activities.find((a) => a.id === wanted);
  return (
    <>
      <BackLink href="/lia">Legitimate interests</BackLink>
      <PageHeader
        title="Add a legitimate interest assessment"
        description="Add it even if you haven't decided yet. Kinga will show what's missing."
      />
      {activities.length === 0 ? (
        <EmptyState title="Add the processing activity first">
          <p>An assessment belongs to an activity in your Records of processing. Add the activity, then come back.</p>
          <p className="mt-4">
            <Link href="/ropa/templates" className={buttonClass.secondary}>
              Records of processing
            </Link>
          </p>
        </EmptyState>
      ) : (
        <LiaForm activities={activities.map((a) => ({ id: a.id, name: a.name }))} activity={activity && { id: activity.id, name: activity.name }} />
      )}
    </>
  );
}
