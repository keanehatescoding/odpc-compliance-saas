import type { Metadata } from "next";
import { BackLink, PageHeader } from "@/components/ui";
import { listActivities } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { ProcessorForm } from "../processor-form";

export const metadata: Metadata = { title: "Add a processor" };

export default async function NewProcessorPage() {
  const { org } = await requireOrgContext();
  const activities = await listActivities(org.id);
  return (
    <>
      <BackLink href="/processors">Processors</BackLink>
      <PageHeader
        title="Add a processor"
        description="Add them even if there's no contract yet. Kinga will show what's missing."
      />
      <ProcessorForm activities={activities.map((a) => ({ id: a.id, name: a.name }))} />
    </>
  );
}
