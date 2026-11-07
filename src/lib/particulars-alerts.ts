import { and, eq, isNull, lte, notExists } from "drizzle-orm";
import type { Db } from "@/db";
import { organizations, particularChangeAlertLog, particularChanges, type ParticularChange } from "@/db/schema";
import { abandoned, deliverClaimed, ownClaim, sentOrClaimed } from "./alert-delivery";
import { addDays, formatDate, todayInKenya } from "./dates";
import type { SendEmail } from "./email";
import {
  daysToNotify,
  DUE_SOON_DAYS,
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
  const now = opts.now ?? new Date();
  // Claims and sends are stamped when they happen: a run may reach an alert long after it began.
  const clock = () => opts.now ?? new Date();
  const today = todayInKenya(now);
  const appUrl = opts.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  const result: ParticularChangeAlertRunResult = { checked: 0, sent: [], failed: [] };

  const awaiting = isNull(particularChanges.notifiedOn);
  // Only changes already due soon, and not those whose overdue alert, the
  // last one, has gone out. The rest have nothing to send, and an unnotified
  // change stays in the table until someone records the notice.
  const dueSoonFrom = addDays(today, DUE_SOON_DAYS - NOTIFY_DAYS);
  const overdueSent = db
    .select({ id: particularChangeAlertLog.id })
    .from(particularChangeAlertLog)
    .where(
      and(
        eq(particularChangeAlertLog.changeId, particularChanges.id),
        eq(particularChangeAlertLog.kind, "overdue"),
        sentOrClaimed(particularChangeAlertLog, now),
      ),
    );
  const rows = await db
    .select({ change: particularChanges, org: organizations })
    .from(particularChanges)
    .innerJoin(organizations, eq(organizations.id, particularChanges.orgId))
    .where(
      and(
        awaiting,
        lte(particularChanges.changedOn, dueSoonFrom),
        notExists(overdueSent),
        opts.changeId ? eq(particularChanges.id, opts.changeId) : undefined,
      ),
    );

  for (const { change: listed, org } of rows) {
    result.checked++;
    if (!dueParticularChangeAlert(listed, today, await sentKinds(db, listed.id, now))) continue;

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
      const kind = dueParticularChangeAlert(change, today, await sentKinds(tx, change.id, now));
      if (!kind) return null;
      const claimedAt = clock();
      const [claimed] = await tx
        .insert(particularChangeAlertLog)
        .values({ changeId: change.id, kind, recipients: to, claimedAt, sentAt: null })
        // A claim left by a run that died before sending is taken over.
        .onConflictDoUpdate({
          target: [particularChangeAlertLog.changeId, particularChangeAlertLog.kind],
          set: { recipients: to, claimedAt },
          setWhere: abandoned(particularChangeAlertLog, claimedAt),
        })
        .returning({ id: particularChangeAlertLog.id });
      return claimed ? { id: claimed.id, change, kind, claimedAt } : null;
    });
    if (!claim) continue;
    const { change, kind } = claim;

    const mine = ownClaim(particularChangeAlertLog, eq(particularChangeAlertLog.id, claim.id), claim.claimedAt);
    const delivery = await deliverClaimed(
      sendEmail,
      {
        to,
        subject: alertSubject(org.name, change, today),
        text: alertBody(org.name, change, today, `${appUrl}/registrations/changes/${change.id}`),
      },
      {
        label: "particulars alert",
        markSent: (recipients) => db.update(particularChangeAlertLog).set({ sentAt: clock(), recipients }).where(mine),
        release: () => db.delete(particularChangeAlertLog).where(mine),
      },
    );
    if (delivery.sent) result.sent.push({ changeId: change.id, kind, to: delivery.sent });
    if (delivery.error) result.failed.push({ changeId: change.id, error: delivery.error });
  }
  return result;
}

async function sentKinds(db: Db, changeId: string, now: Date): Promise<Set<string>> {
  const rows = await db
    .select({ kind: particularChangeAlertLog.kind })
    .from(particularChangeAlertLog)
    .where(and(eq(particularChangeAlertLog.changeId, changeId), sentOrClaimed(particularChangeAlertLog, now)));
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
