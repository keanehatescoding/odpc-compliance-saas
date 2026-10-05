import type { Metadata } from "next";
import { BackLink, PageHeader } from "@/components/ui";
import { todayInKenya } from "@/lib/dates";
import { requireOrgContext } from "@/lib/session";
import { RequestForm } from "../request-form";

export const metadata: Metadata = { title: "Log a request" };

export default async function NewRequestPage() {
  await requireOrgContext();
  return (
    <>
      <BackLink href="/requests">Data subject requests</BackLink>
      <PageHeader
        title="Log a request"
        description="Record it the day it arrives. A request doesn't need to be on an ODPC form or mention the law to count."
      />
      <RequestForm defaults={{ receivedOn: todayInKenya() }} />
    </>
  );
}
