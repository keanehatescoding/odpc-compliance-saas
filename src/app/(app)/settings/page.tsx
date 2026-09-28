import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { requireOrgContext } from "@/lib/session";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { org, role } = await requireOrgContext();
  const owners = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, org.id), eq(memberships.role, "owner")));

  return (
    <>
      <PageHeader title="Settings" description="Organisation details and where renewal reminders are sent." />
      <SettingsForm org={org} canEdit={role !== "member"} ownerEmails={owners.map((o) => o.email)} />
    </>
  );
}
