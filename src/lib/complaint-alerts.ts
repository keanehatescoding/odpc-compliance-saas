import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { complaintAlertLog, complaints, organizations, type Complaint } from "@/db/schema";
import { daysToAct, dueComplaintAlert, formatDaysLeft, kindInfo, type ComplaintAlertKind } from "./complaint";
import { formatDate, todayInKenya } from "./dates";
import type { SendEmail } from "./email";
import { reminderRecipients } from "./reminders";

export interface ComplaintAlertRunResult {
  checked: number;
  sent: { complaintId: string; kind: ComplaintAlertKind; to: string[] }[];
  failed: { complaintId: string; error: string }[];
}

/**
 * Emails the team about ODPC complaints and notices close to or past the date
 * to respond. Claimed in complaint_alert_log before sending, as with data
 * subject request alerts, so it is safe to run often.
 */
export async function runComplaintAlerts(
  db: Db,
  sendEmail: SendEmail,
  opts: { now?: Date; appUrl?: string; complaintId?: string } = {},
): Promise<ComplaintAlertRunResult> {
  const today = todayInKenya(opts.now ?? new Date());
  const appUrl = opts.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  const result: ComplaintAlertRunResult = { checked: 0, sent: [], failed: [] };

  const awaiting = and(isNull(complaints.respondedOn), isNull(complaints.closedOn));
  const rows = await db
    .select({ complaint: complaints, org: organizations })
    .from(complaints)
    .innerJoin(organizations, eq(organizations.id, complaints.orgId))
    .where(and(awaiting, opts.complaintId ? eq(complaints.id, opts.complaintId) : undefined));

  for (const { complaint: listed, org } of rows) {
    result.checked++;
    if (!dueComplaintAlert(listed, today, await sentKinds(db, listed.id))) continue;

    const to = await reminderRecipients(db, org);
    if (to.length === 0) continue;

    // The row above may predate an edit that moved the deadline, and an edit
    // clears the claims made for the old one. Lock the complaint (as edits do),
    // reload it and decide again, so a stale deadline can't claim an alert.
    const claim = await db.transaction(async (tx) => {
      const [complaint] = await tx
        .select()
        .from(complaints)
        .where(and(eq(complaints.id, listed.id), awaiting))
        .for("update");
      if (!complaint) return null;
      const kind = dueComplaintAlert(complaint, today, await sentKinds(tx, complaint.id));
      if (!kind) return null;
      const [claimed] = await tx
        .insert(complaintAlertLog)
        .values({ complaintId: complaint.id, kind, recipients: to })
        .onConflictDoNothing()
        .returning({ id: complaintAlertLog.id });
      return claimed ? { id: claimed.id, complaint, kind } : null;
    });
    if (!claim) continue;
    const { complaint, kind } = claim;

    try {
      await sendEmail({
        to,
        subject: alertSubject(org.name, complaint, today),
        text: alertBody(org.name, complaint, today, `${appUrl}/complaints/${complaint.id}`),
      });
      result.sent.push({ complaintId: complaint.id, kind, to });
    } catch (err) {
      result.failed.push({ complaintId: complaint.id, error: err instanceof Error ? err.message : String(err) });
      // Release the claim so the next run retries. If that fails too, keep going with the other complaints.
      await db
        .delete(complaintAlertLog)
        .where(eq(complaintAlertLog.id, claim.id))
        .catch((releaseErr) => console.error("Failed to release complaint alert claim", releaseErr));
    }
  }
  return result;
}

async function sentKinds(db: Db, complaintId: string): Promise<Set<string>> {
  const rows = await db
    .select({ kind: complaintAlertLog.kind })
    .from(complaintAlertLog)
    .where(eq(complaintAlertLog.complaintId, complaintId));
  return new Set(rows.map((r) => r.kind));
}

function alertSubject(orgName: string, c: Complaint, today: string): string {
  const info = kindInfo(c.kind);
  const left = daysToAct(c, today);
  if (left < 0) return `${orgName}: the ODPC ${info.short} is overdue`;
  return `${orgName}: ${info.todo.toLowerCase()} the ODPC ${info.short} (${formatDaysLeft(left)})`;
}

// The complainant isn't named: the email goes to every owner, and the page it links to says who it is.
function alertBody(orgName: string, c: Complaint, today: string, link: string): string {
  const info = kindInfo(c.kind);
  const due = formatDate(c.dueOn);
  const left = daysToAct(c, today);
  const what = `${/^[aeiou]/.test(info.short) ? "an" : "a"} ${info.short}`;
  return [
    `Hello,`,
    ``,
    `${orgName} received ${what} from the Office of the Data Protection Commissioner on ${formatDate(c.receivedOn)}${c.reference ? ` (reference ${c.reference})` : ""}.`,
    ``,
    left >= 0
      ? `The date to act on it is ${due} (${formatDaysLeft(left)}), under ${info.provision}.`
      : `The date to act on it, ${due}, has passed. Deal with it as soon as you can, and tell the ODPC why it is late.`,
    ``,
    info.guidance,
    ``,
    `Record what you did here:`,
    link,
  ].join("\n");
}
