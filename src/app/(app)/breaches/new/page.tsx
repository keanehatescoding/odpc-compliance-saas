import type { Metadata } from "next";
import { BackLink, PageHeader } from "@/components/ui";
import { toKenyaDateTimeLocal } from "@/lib/dates";
import { listActivities } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { BreachForm } from "../breach-form";

export const metadata: Metadata = { title: "Log a breach" };

export default async function NewBreachPage() {
  const { user, org } = await requireOrgContext();
  const activities = await listActivities(org.id);
  return (
    <>
      <BackLink href="/breaches">Data breaches</BackLink>
      <PageHeader
        title="Log a breach"
        description="Record what you know now; you can add details as you find them out. Only the first section is required."
      />
      <BreachForm
        activities={activities.map(({ id, name }) => ({ id, name }))}
        defaults={{ discoveredAt: toKenyaDateTimeLocal(new Date()), contactPerson: `${user.name}, ${user.email}` }}
      />
    </>
  );
}
