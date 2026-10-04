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

  for (const { request, org } of rows) {
    result.checked++;
    const sentRows = await db
      .select({ kind: subjectRequestAlertLog.kind })
      .from(subjectRequestAlertLog)
      .where(eq(subjectRequestAlertLog.requestId, request.id));
    const kind = dueRequestAlert(request, today, new Set(sentRows.map((r) => r.kind)));
    if (!kind) continue;

    const to = await reminderRecipients(db, org);
    if (to.length === 0) continue;

    const claimed = await db
      .insert(subjectRequestAlertLog)
      .values({ requestId: request.id, kind, recipients: to })
      .onConflictDoNothing()
      .returning({ id: subjectRequestAlertLog.id });
    if (claimed.length === 0) continue;

    try {
      await sendEmail({
        to,
        subject: alertSubject(org.name, request, today),
        text: alertBody(org.name, request, today, `${appUrl}/requests/${request.id}`),
      });
      result.sent.push({ requestId: request.id, kind, to });
    } catch (err) {
      await db.delete(subjectRequestAlertLog).where(eq(subjectRequestAlertLog.id, claimed[0].id));
      result.failed.push({ requestId: request.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
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
