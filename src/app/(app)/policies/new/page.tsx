import type { Metadata } from "next";
import { BackLink, PageHeader } from "@/components/ui";
import { todayInKenya } from "@/lib/dates";
import { POLICY_KIND_KEYS } from "@/lib/policy";
import { requireOrgContext } from "@/lib/session";
import { PolicyForm } from "../policy-form";

export const metadata: Metadata = { title: "Add a policy" };

export default async function NewPolicyPage({ searchParams }: PageProps<"/policies/new">) {
  await requireOrgContext();
  const query = await searchParams;
  return (
    <>
      <BackLink href="/policies">Policies</BackLink>
      <PageHeader
        title="Add a policy"
        description="Add it even if it is still a draft, or you can't fill everything in yet. Kinga will show what's missing."
      />
      <PolicyForm kind={POLICY_KIND_KEYS.find((k) => k === query.kind)} today={todayInKenya()} />
    </>
  );
}
