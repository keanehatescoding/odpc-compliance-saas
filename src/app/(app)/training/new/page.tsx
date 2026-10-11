import type { Metadata } from "next";
import { BackLink, PageHeader } from "@/components/ui";
import { listTrainingSessions } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { TrainingForm } from "../training-form";

export const metadata: Metadata = { title: "Record a training session" };

export default async function NewTrainingPage({ searchParams }: PageProps<"/training/new">) {
  const { org } = await requireOrgContext();
  const { refreshes: raw } = await searchParams;
  const sessions = await listTrainingSessions(org.id);
  // "Record the refresher" on a session's page links here with that session's id.
  const refreshes = typeof raw === "string" ? sessions.find((s) => s.id === raw) : undefined;
  return (
    <>
      <BackLink href="/training">Staff training</BackLink>
      <PageHeader
        title={refreshes ? "Record the refresher" : "Record a training session"}
        description={
          refreshes
            ? `The refresher for “${refreshes.title}”. The details below start from that session, so change what was different this time.`
            : "Record a session once it has been held. Kinga will tell you when its refresher is due."
        }
      />
      <TrainingForm sessions={sessions} refreshes={refreshes} />
    </>
  );
}
