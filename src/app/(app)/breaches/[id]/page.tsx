import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteBreach } from "@/app/actions/breaches";
import { Countdown } from "@/components/countdown";
import { DeleteButton } from "@/components/delete-button";
import { BackLink, BreachStatusBadge, buttonClass, Card, cx, PageHeader } from "@/components/ui";
import {
  BREACH_KINDS,
  breachStatus,
  notificationDeadline,
  NOTIFY_WHOM,
  NOTIFY_WITHIN_HOURS,
  outstandingTasks,
  subjectNoticeRequired,
  type BreachKind,
} from "@/lib/breach";
import { formatDateTime } from "@/lib/dates";
import { REGISTRATION_ROLES, type RegistrationRole } from "@/lib/dpa";
import { breachActivityList, getBreach, listActivities, listBreachUpdates } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { BreachForm } from "../breach-form";
import { NoteForm } from "./note-form";

export const metadata: Metadata = { title: "Breach" };

export default async function BreachPage({ params }: PageProps<"/breaches/[id]">) {
  const { id } = await params;
  const { org } = await requireOrgContext();
  const breach = isUuid(id) ? await getBreach(org.id, id) : null;
  if (!breach) notFound();
  const [activities, linked, updates] = await Promise.all([
    listActivities(org.id),
    breachActivityList(breach.id),
    listBreachUpdates(breach.id),
  ]);

  const now = new Date();
  const status = breachStatus(breach, now);
  const role = breach.role as RegistrationRole;
  const whom = NOTIFY_WHOM[role];
  const deadline = notificationDeadline(breach);
  const tasks = outstandingTasks(breach);
  const running = status === "open" || status === "overdue";

  return (
    <>
      <BackLink href="/breaches">Data breaches</BackLink>
      <PageHeader
        title={breach.title}
        description={`${BREACH_KINDS[breach.kind as BreachKind]} · ${REGISTRATION_ROLES[role]}`}
        actions={
          <>
            <Link href={`/breaches/${breach.id}/notice`} className={buttonClass.secondary}>
              Draft notification to {role === "processor" ? "controller" : "ODPC"}
            </Link>
            {subjectNoticeRequired(breach) && (
              <Link href={`/breaches/${breach.id}/notice?for=subjects`} className={buttonClass.secondary}>
                Draft notice to affected people
              </Link>
            )}
            <DeleteButton action={deleteBreach.bind(null, breach.id)} />
          </>
        }
      />

      <Card
        className={cx(
          "mb-6 max-w-3xl",
          status === "overdue" && "border-red-300 bg-red-50",
          status === "open" && "border-orange-300 bg-orange-50",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BreachStatusBadge status={status} />
          {running && (
            <p className={cx("text-2xl font-semibold", status === "overdue" ? "text-red-800" : "text-orange-900")}>
              <Countdown deadline={deadline.toISOString()} now={now.toISOString()} />
            </p>
          )}
        </div>
        <p className="mt-3 text-sm text-stone-700">
          {running ? (
            <>
              Notify {whom} by <strong>{formatDateTime(deadline)}</strong>, {NOTIFY_WITHIN_HOURS[role]} hours after you became
              aware ({formatDateTime(breach.discoveredAt)}).
              {role === "controller" &&
                " If you assess that harm is unlikely, record your reasoning below and notification is not required."}
              {status === "overdue" && " The notification must now include the reasons for the delay."}
            </>
          ) : status === "notified" ? (
            <>
              Notified {whom} on {formatDateTime(breach.notifiedAt)}
              {breach.notificationRef && <> (ref. {breach.notificationRef})</>}.
            </>
          ) : status === "not_required" ? (
            <>Assessed as unlikely to result in harm, so the ODPC does not need to be notified. Keep this record.</>
          ) : (
            <>Closed on {formatDateTime(breach.closedAt)}.</>
          )}
        </p>
        {tasks.length > 0 && (
          <ul className="mt-3 list-disc pl-5 text-sm text-stone-800">
            {tasks.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
      </Card>

      <BreachForm
        breach={breach}
        activities={activities.map(({ id, name }) => ({ id, name }))}
        linkedActivityIds={linked.map((a) => a.id)}
      />

      <Card className="mt-6 max-w-3xl space-y-5">
        <div>
          <h2 className="font-semibold">Incident log</h2>
          <p className="text-sm text-stone-600">
            A dated record of what you found and did. Keep one for every breach, including its effects and your response; the
            ODPC can ask to see it.
          </p>
        </div>
        <NoteForm breachId={breach.id} />
        <ol className="divide-y divide-stone-100 border-t border-stone-100">
          {updates.map((u) => (
            <li key={u.id} className="py-3 text-sm">
              <p className="text-xs text-stone-500">
                {formatDateTime(u.createdAt)}
                {u.author && <> · {u.author}</>}
              </p>
              <p className="mt-0.5 whitespace-pre-line">{u.note}</p>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
