import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { organizations, subjectRequestAlertLog, subjectRequests, type SubjectRequest } from "@/db/schema";
import { abandoned, deliverClaimed, ownClaim, sentOrClaimed } from "./alert-delivery";
import { formatDate, todayInKenya } from "./dates";
import type { SendEmail } from "./email";
import { reminderRecipients } from "./reminders";
import {
  daysToRespond,
  dueRequestAlert,
  formatDaysLeft,
  kindInfo,
  responseDueOn,
  type RequestAlertKind,
} from "./subject-request";

export interface RequestAlertRunResult {
  checked: number;
  sent: { requestId: string; kind: RequestAlertKind; to: string[] }[];
  failed: { requestId: string; error: string }[];
}

/**
 * Emails the team about data subject requests close to or past their response
 * deadline. Claimed in subject_request_alert_log before sending, as with
 * breach alerts, so it is safe to run often.
 */
export async function runSubjectRequestAlerts(
  db: Db,
  sendEmail: SendEmail,
  opts: { now?: Date; appUrl?: string; requestId?: string } = {},
): Promise<RequestAlertRunResult> {
  const now = opts.now ?? new Date();
  // Claims are checked, made and marked sent at the time they happen: a run may reach an alert long after it began.
  const clock = () => opts.now ?? new Date();
  const today = todayInKenya(now);
  const appUrl = opts.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  const result: RequestAlertRunResult = { checked: 0, sent: [], failed: [] };

  const rows = await db
    .select({ request: subjectRequests, org: organizations })
    .from(subjectRequests)
    .innerJoin(organizations, eq(organizations.id, subjectRequests.orgId))
    .where(and(isNull(subjectRequests.outcome), opts.requestId ? eq(subjectRequests.id, opts.requestId) : undefined));

  for (const { request: listed, org } of rows) {
    result.checked++;
    if (!dueRequestAlert(listed, today, await sentKinds(db, listed.id, clock()))) continue;

    const to = await reminderRecipients(db, org);
    if (to.length === 0) continue;

    // The row above may predate an edit that moved the deadline, and an edit
    // clears the claims made for the old one. Lock the request (as edits do),
    // reload it and decide again, so a stale deadline can't claim an alert.
    const claim = await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(subjectRequests)
        .where(and(eq(subjectRequests.id, listed.id), isNull(subjectRequests.outcome)))
        .for("update");
      if (!request) return null;
      const kind = dueRequestAlert(request, today, await sentKinds(tx, request.id, clock()));
      if (!kind) return null;
      const claimedAt = clock();
      const [claimed] = await tx
        .insert(subjectRequestAlertLog)
        .values({ requestId: request.id, kind, recipients: to, claimedAt, sentAt: null })
        // A claim left by a run that died before sending is taken over.
        .onConflictDoUpdate({
          target: [subjectRequestAlertLog.requestId, subjectRequestAlertLog.kind],
          set: { recipients: to, claimedAt },
          setWhere: abandoned(subjectRequestAlertLog, claimedAt),
        })
        .returning({ id: subjectRequestAlertLog.id });
      return claimed ? { id: claimed.id, request, kind, claimedAt } : null;
    });
    if (!claim) continue;
    const { request, kind } = claim;

    const mine = ownClaim(subjectRequestAlertLog, eq(subjectRequestAlertLog.id, claim.id), claim.claimedAt);
    const delivery = await deliverClaimed(
      sendEmail,
      {
        to,
        subject: alertSubject(org.name, request, today),
        text: alertBody(org.name, request, today, `${appUrl}/requests/${request.id}`),
      },
      {
        label: "subject request alert",
        markSent: (recipients) =>
          db.update(subjectRequestAlertLog).set({ sentAt: clock(), recipients }).where(mine).returning({ id: subjectRequestAlertLog.id }),
        release: () => db.delete(subjectRequestAlertLog).where(mine),
      },
    );
    if (delivery.sent) result.sent.push({ requestId: request.id, kind, to: delivery.sent });
    if (delivery.error) result.failed.push({ requestId: request.id, error: delivery.error });
  }
  return result;
}

async function sentKinds(db: Db, requestId: string, now: Date): Promise<Set<string>> {
  const rows = await db
    .select({ kind: subjectRequestAlertLog.kind })
    .from(subjectRequestAlertLog)
    .where(and(eq(subjectRequestAlertLog.requestId, requestId), sentOrClaimed(subjectRequestAlertLog, now)));
  return new Set(rows.map((r) => r.kind));
}

function alertSubject(orgName: string, r: SubjectRequest, today: string): string {
  const left = daysToRespond(r, today);
  const what = `${kindInfo(r.kind).short} from ${r.requesterName}`;
  if (left < 0) return `${orgName}: response to ${what} is overdue`;
  return `${orgName}: respond to ${what} (${formatDaysLeft(left)})`;
}

function alertBody(orgName: string, r: SubjectRequest, today: string, link: string): string {
  const info = kindInfo(r.kind);
  const due = formatDate(responseDueOn(r));
  const left = daysToRespond(r, today);
  return [
    `Hello,`,
    ``,
    `${r.requesterName} sent ${orgName} a request on ${formatDate(r.receivedOn)}: ${info.label.toLowerCase()}.`,
    ``,
    left >= 0
      ? `Under ${info.regulation} of the Data Protection (General) Regulations you must respond within ${info.days} days, by ${due}.`
      : `The ${info.days}-day deadline to respond passed on ${due}. Respond as soon as you can.`,
    ``,
    `Record your response here:`,
    link,
  ].join("\n");
}
