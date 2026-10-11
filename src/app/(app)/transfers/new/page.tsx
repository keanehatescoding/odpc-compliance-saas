import type { Metadata } from "next";
import Link from "next/link";
import { BackLink, buttonClass, EmptyState, PageHeader } from "@/components/ui";
import { listActivities } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { TransferForm } from "../transfer-form";

export const metadata: Metadata = { title: "Add a transfer outside Kenya" };

export default async function NewTransferPage({ searchParams }: PageProps<"/transfers/new">) {
  const { org } = await requireOrgContext();
  const [activities, query] = await Promise.all([listActivities(org.id), searchParams]);
  const wanted = typeof query.activity === "string" ? query.activity : null;
  const activity = activities.find((a) => a.id === wanted);
  return (
    <>
      <BackLink href="/transfers">Transfers outside Kenya</BackLink>
      <PageHeader
        title="Add a transfer outside Kenya"
        description="Add it even if you don't yet know what it relies on. Kinga will show what's missing."
      />
      {activities.length === 0 ? (
        <EmptyState title="Add the processing activity first">
          <p>A transfer is part of an activity in your Records of processing. Add the activity, then come back.</p>
          <p className="mt-4">
            <Link href="/ropa/templates" className={buttonClass.secondary}>
              Records of processing
            </Link>
          </p>
        </EmptyState>
      ) : (
        <TransferForm
          activities={activities.map((a) => ({ id: a.id, name: a.name }))}
          activity={activity && { id: activity.id, countries: activity.transferCountries }}
        />
      )}
    </>
  );
}
