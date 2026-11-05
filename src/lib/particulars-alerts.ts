import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { organizations, particularChangeAlertLog, particularChanges, type ParticularChange } from "@/db/schema";
import { formatDate, todayInKenya } from "./dates";
import type { SendEmail } from "./email";
import {
  daysToNotify,
  dueParticularChangeAlert,
  formatDaysLeft,
  notifyBy,
  NOTIFY_DAYS,
  PARTICULARS_PROVISION,
  roleLabel,
  type ParticularChangeAlertKind,
} from "./particulars";
import { reminderRecipients } from "./reminders";

export interface ParticularChangeAlertRunResult {
  checked: number;
  sent: { changeId: string; kind: ParticularChangeAlertKind; to: string[] }[];
  failed: { changeId: string; error: string }[];
}

/**
 * Emails the team about changes to the registered particulars the ODPC hasn't
 * been told of, close to or past the 14 days. Claimed in
 * particular_change_alert_log before sending, as with complaint alerts, so it
 * is safe to run often.
 */
export async function runParticularChangeAlerts(
  db: Db,
  sendEmail: SendEmail,
  opts: { now?: Date; appUrl?: string; changeId?: string } = {},
): Promise<ParticularChangeAlertRunResult> {
  const today = todayInKenya(opts.now ?? new Date());
  const appUrl = opts.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  const result: ParticularChangeAlertRunResult = { checked: 0, sent: [], failed: [] };

  const awaiting = isNull(particularChanges.notifiedOn);
  const rows = await db
    .select({ change: particularChanges, org: organizations })
    .from(particularChanges)
    .innerJoin(organizations, eq(organizations.id, particularChanges.orgId))
    .where(and(awaiting, opts.changeId ? eq(particularChanges.id, opts.changeId) : undefined));

  for (const { change: listed, org } of rows) {
    result.checked++;
    if (!dueParticularChangeAlert(listed, today, await sentKinds(db, listed.id))) continue;

    const to = await reminderRecipients(db, org);
    if (to.length === 0) continue;

    // An edit may have moved the date of the change, clearing the claims made
    // for the old deadline. Lock the row (as edits do), reload it and decide
    // again, so a stale date can't claim an alert.
    const claim = await db.transaction(async (tx) => {
      const [change] = await tx
        .select()
        .from(particularChanges)
        .where(and(eq(particularChanges.id, listed.id), awaiting))
        .for("update");
      if (!change) return null;
      const kind = dueParticularChangeAlert(change, today, await sentKinds(tx, change.id));
      if (!kind) return null;
      const [claimed] = await tx
        .insert(particularChangeAlertLog)
        .values({ changeId: change.id, kind, recipients: to })
        .onConflictDoNothing()
        .returning({ id: particularChangeAlertLog.id });
      return claimed ? { id: claimed.id, change, kind } : null;
    });
    if (!claim) continue;
    const { change, kind } = claim;

    try {
      await sendEmail({
        to,
        subject: alertSubject(org.name, change, today),
        text: alertBody(org.name, change, today, `${appUrl}/registrations/changes/${change.id}`),
      });
      result.sent.push({ changeId: change.id, kind, to });
    } catch (err) {
      result.failed.push({ changeId: change.id, error: err instanceof Error ? err.message : String(err) });
      // Release the claim so the next run retries. If that fails too, keep going with the other changes.
      await db
        .delete(particularChangeAlertLog)
        .where(eq(particularChangeAlertLog.id, claim.id))
        .catch((releaseErr) => console.error("Failed to release particulars alert claim", releaseErr));
    }
  }
  return result;
}

async function sentKinds(db: Db, changeId: string): Promise<Set<string>> {
  const rows = await db
    .select({ kind: particularChangeAlertLog.kind })
    .from(particularChangeAlertLog)
    .where(eq(particularChangeAlertLog.changeId, changeId));
  return new Set(rows.map((r) => r.kind));
}

export function alertSubject(orgName: string, c: ParticularChange, today: string): string {
  const left = daysToNotify(c, today);
  if (left < 0) return `${orgName}: the ODPC hasn't been told of a change to your registration`;
  return `${orgName}: tell the ODPC about a change to your registration (${formatDaysLeft(left)})`;
}

export function alertBody(orgName: string, c: ParticularChange, today: string, link: string): string {
  const left = daysToNotify(c, today);
  const due = formatDate(notifyBy(c));
  return [
    `Hello,`,
    ``,
    `The particulars of ${orgName}'s ODPC registration changed on ${formatDate(c.changedOn)}, for ${roleLabel(c.role)}:`,
    ``,
    c.description,
    ``,
    left >= 0
      ? `Under ${PARTICULARS_PROVISION}, the Data Commissioner must be told in writing within ${NOTIFY_DAYS} days, by ${due} (${formatDaysLeft(left)}).`
      : `Under ${PARTICULARS_PROVISION}, the Data Commissioner had to be told in writing by ${due}. Send the notice as soon as you can; not notifying is an offence.`,
    ``,
    `Record when you sent it here:`,
    link,
  ].join("\n");
}
