import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteTraining } from "@/app/actions/training";
import { RecordHistory } from "@/components/activity-list";
import { DeleteButton } from "@/components/delete-button";
import { BackLink, buttonClass, Card, cx, PageHeader, TrainingStatusBadge } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { listTrainingSessions } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { daysToRefresher, refreshedIds, TRAINING_TOPICS, trainingGaps, trainingStatus } from "@/lib/training";
import { isUuid } from "@/lib/uuid";
import { TrainingForm } from "../training-form";

export const metadata: Metadata = { title: "Training session" };

export default async function TrainingSessionPage({ params }: PageProps<"/training/[id]">) {
  const { id } = await params;
  const { org } = await requireOrgContext();
  const sessions = isUuid(id) ? await listTrainingSessions(org.id) : [];
  const session = sessions.find((s) => s.id === id);
  if (!session) notFound();

  const today = todayInKenya();
  const status = trainingStatus(session, refreshedIds(sessions), today);
  const gaps = trainingGaps(session, status === "refreshed");
  const dueIn = daysToRefresher(session, today);
  const refreshers = sessions.filter((s) => s.refreshesId === session.id);
  const refreshes = sessions.find((s) => s.id === session.refreshesId);

  return (
    <>
      <BackLink href="/training">Staff training</BackLink>
      <PageHeader title={session.title} actions={<DeleteButton action={deleteTraining.bind(null, session.id)} />} />

      <Card className={cx("mb-6 max-w-3xl", status === "refresher_due" && "border-amber-300 bg-amber-50")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TrainingStatusBadge status={status} />
          <p className="text-sm text-stone-700">
            Held {formatDate(session.heldOn)}
            {session.attendeeCount !== null && ` · ${session.attendeeCount} attended`}
          </p>
        </div>
        {status === "refresher_due" && (
          <p className="mt-3 text-sm text-stone-700">
            The refresher was due on <strong>{formatDate(session.refresherOn)}</strong>. Once it has been held, record it
            as a new session.
          </p>
        )}
        {status === "current" && dueIn !== null && (
          <p className="mt-3 text-sm text-stone-700">
            Refresher due on {formatDate(session.refresherOn)}, in {dueIn} {dueIn === 1 ? "day" : "days"}.
          </p>
        )}
        {refreshers.map((r) => (
          <p key={r.id} className="mt-3 text-sm text-stone-700">
            Refreshed by{" "}
            <Link href={`/training/${r.id}`} className="font-medium underline">
              {r.title}
            </Link>
            , held {formatDate(r.heldOn)}.
          </p>
        ))}
        {refreshes && (
          <p className="mt-3 text-sm text-stone-700">
            This was the refresher for{" "}
            <Link href={`/training/${refreshes.id}`} className="font-medium underline">
              {refreshes.title}
            </Link>
            , held {formatDate(refreshes.heldOn)}.
          </p>
        )}
        {gaps.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-stone-700">
            {gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        )}
        {status !== "refreshed" && (
          <p className="mt-4">
            <Link href={`/training/new?refreshes=${session.id}`} className={buttonClass.secondary}>
              Record the refresher
            </Link>
          </p>
        )}
        <details className="mt-3 text-sm text-stone-700">
          <summary className="cursor-pointer font-medium">What training should cover</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {TRAINING_TOPICS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-600">A starting list, not legal advice. Fit it to the data your staff actually handle.</p>
        </details>
      </Card>

      <TrainingForm session={session} sessions={sessions} />
      <RecordHistory orgId={org.id} subjectId={session.id} />
    </>
  );
}
