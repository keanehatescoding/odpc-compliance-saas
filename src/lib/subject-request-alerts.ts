import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { organizations, subjectRequestAlertLog, subjectRequests, type SubjectRequest } from "@/db/schema";
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
  const today = todayInKenya(opts.now ?? new Date());
  const appUrl = opts.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  const result: RequestAlertRunResult = { checked: 0, sent: [], failed: [] };

  const rows = await db
    .select({ request: subjectRequests, org: organizations })
    .from(subjectRequests)
    .innerJoin(organizations, eq(organizations.id, subjectRequests.orgId))
    .where(and(isNull(subjectRequests.outcome), opts.requestId ? eq(subjectRequests.id, opts.requestId) : undefined));

  for (const { request: listed, org } of rows) {
    result.checked++;
    if (!dueRequestAlert(listed, today, await sentKinds(db, listed.id))) continue;

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
      const kind = dueRequestAlert(request, today, await sentKinds(tx, request.id));
      if (!kind) return null;
      const [claimed] = await tx
        .insert(subjectRequestAlertLog)
        .values({ requestId: request.id, kind, recipients: to })
        .onConflictDoNothing()
        .returning({ id: subjectRequestAlertLog.id });
      return claimed ? { id: claimed.id, request, kind } : null;
    });
    if (!claim) continue;
    const { request, kind } = claim;

    try {
      await sendEmail({
        to,
        subject: alertSubject(org.name, request, today),
        text: alertBody(org.name, request, today, `${appUrl}/requests/${request.id}`),
      });
      result.sent.push({ requestId: request.id, kind, to });
    } catch (err) {
      result.failed.push({ requestId: request.id, error: err instanceof Error ? err.message : String(err) });
      // Release the claim so the next run retries. If that fails too, keep going with the other requests.
      await db
        .delete(subjectRequestAlertLog)
        .where(eq(subjectRequestAlertLog.id, claim.id))
        .catch((releaseErr) => console.error("Failed to release subject request alert claim", releaseErr));
    }
  }
  return result;
}

async function sentKinds(db: Db, requestId: string): Promise<Set<string>> {
  const rows = await db
    .select({ kind: subjectRequestAlertLog.kind })
    .from(subjectRequestAlertLog)
    .where(eq(subjectRequestAlertLog.requestId, requestId));
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
