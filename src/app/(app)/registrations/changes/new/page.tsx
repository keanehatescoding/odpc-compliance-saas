import type { Metadata } from "next";
import { BackLink, PageHeader } from "@/components/ui";
import { isIsoDate, todayInKenya } from "@/lib/dates";
import { requireOrgContext } from "@/lib/session";
import { ParticularChangeForm } from "../particular-change-form";

export const metadata: Metadata = { title: "Log a change of registered particulars" };

export default async function NewParticularChangePage({ searchParams }: PageProps<"/registrations/changes/new">) {
  await requireOrgContext();
  const query = await searchParams;
  const today = todayInKenya();
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const role = one(query.role);
  const changedOn = one(query.changedOn);
  return (
    <>
      <BackLink href="/registrations">ODPC registration</BackLink>
      <PageHeader
        title="Log a change of registered particulars"
        description="When something the ODPC's register says about you changes, you have 14 days to tell the Data Commissioner in writing. Log it here and Kinga will remind you."
      />
      <ParticularChangeForm
        today={today}
        prefill={{
          role: role === "controller" || role === "processor" ? role : query.what ? "both" : "",
          description: one(query.what).slice(0, 2000),
          changedOn: isIsoDate(changedOn) && changedOn <= today ? changedOn : today,
        }}
      />
    </>
  );
}
