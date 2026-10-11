import type { Metadata } from "next";
import { BackLink, PageHeader } from "@/components/ui";
import { todayInKenya } from "@/lib/dates";
import { requireOrgContext } from "@/lib/session";
import { ComplaintForm } from "../complaint-form";

export const metadata: Metadata = { title: "Log a complaint or notice" };

export default async function NewComplaintPage() {
  await requireOrgContext();
  return (
    <>
      <BackLink href="/complaints">ODPC complaints</BackLink>
      <PageHeader
        title="Log a complaint or notice"
        description="Record it the day the ODPC's letter or email arrives, with the date it gives you to act by."
      />
      <ComplaintForm defaults={{ receivedOn: todayInKenya() }} />
    </>
  );
}
