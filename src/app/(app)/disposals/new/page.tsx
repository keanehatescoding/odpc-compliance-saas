import type { Metadata } from "next";
import { BackLink, PageHeader } from "@/components/ui";
import { todayInKenya } from "@/lib/dates";
import { listActivities } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { DisposalForm } from "../disposal-form";

export const metadata: Metadata = { title: "Record a disposal" };

export default async function NewDisposalPage({ searchParams }: PageProps<"/disposals/new">) {
  const { org } = await requireOrgContext();
  const [activities, query] = await Promise.all([listActivities(org.id), searchParams]);
  const wanted = typeof query.activity === "string" ? query.activity : null;
  return (
    <>
      <BackLink href="/disposals">Data disposal</BackLink>
      <PageHeader
        title="Record a disposal"
        description="Record it once the data has gone. Add it even if you can't fill everything in yet. Kinga will show what's missing."
      />
      <DisposalForm
        activities={activities.map((a) => ({ id: a.id, name: a.name }))}
        activityId={activities.find((a) => a.id === wanted)?.id}
        today={todayInKenya()}
      />
    </>
  );
}
