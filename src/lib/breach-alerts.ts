import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { breachAlertLog, breaches, organizations, type Breach } from "@/db/schema";
import { formatDateTime } from "./dates";
import {
  dueBreachAlert,
  formatHours,
  hoursLeft,
  notificationDeadline,
  NOTIFY_WHOM,
  NOTIFY_WITHIN_HOURS,
  type BreachAlertKind,
} from "./breach";
import type { RegistrationRole } from "./dpa";
import type { SendEmail } from "./email";
import { reminderRecipients } from "./reminders";

export interface BreachAlertRunResult {
  checked: number;
  sent: { breachId: string; kind: BreachAlertKind; to: string[] }[];
  failed: { breachId: string; error: string }[];
}

/**
 * Emails the team about breaches whose notification deadline is running:
 * once when logged, once with 24 hours left, and once when overdue. Claimed
 * in breach_alert_log before sending, as with renewal reminders, so it is safe
 * to run often. Run it hourly: the deadline is measured in hours.
 */
export async function runBreachAlerts(
  db: Db,
  sendEmail: SendEmail,
  opts: { now?: Date; appUrl?: string; breachId?: string } = {},
): Promise<BreachAlertRunResult> {
  const now = opts.now ?? new Date();
  const appUrl = opts.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  const result: BreachAlertRunResult = { checked: 0, sent: [], failed: [] };

  const rows = await db
    .select({ breach: breaches, org: organizations })
    .from(breaches)
    .innerJoin(organizations, eq(organizations.id, breaches.orgId))
    .where(
      and(isNull(breaches.closedAt), isNull(breaches.notifiedAt), opts.breachId ? eq(breaches.id, opts.breachId) : undefined),
    );

  for (const { breach, org } of rows) {
    result.checked++;
    const sentRows = await db
      .select({ kind: breachAlertLog.kind })
      .from(breachAlertLog)
      .where(eq(breachAlertLog.breachId, breach.id));
    const kind = dueBreachAlert(breach, now, new Set(sentRows.map((r) => r.kind)));
    if (!kind) continue;

    const to = await reminderRecipients(db, org);
    if (to.length === 0) continue;

    const claimed = await db
      .insert(breachAlertLog)
      .values({ breachId: breach.id, kind, recipients: to })
      .onConflictDoNothing()
      .returning({ id: breachAlertLog.id });
    if (claimed.length === 0) continue;

    try {
      await sendEmail({
        to,
        subject: alertSubject(org.name, breach, kind, now),
        text: alertBody(org.name, breach, now, `${appUrl}/breaches/${breach.id}`),
      });
      result.sent.push({ breachId: breach.id, kind, to });
    } catch (err) {
      await db.delete(breachAlertLog).where(eq(breachAlertLog.id, claimed[0].id));
      result.failed.push({ breachId: breach.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}

function alertSubject(orgName: string, b: Breach, kind: BreachAlertKind, now: Date): string {
  const whom = NOTIFY_WHOM[b.role as RegistrationRole];
  const left = hoursLeft(b, now);
  if (kind === "overdue") return `${orgName}: breach notification to ${whom} is overdue (${b.title})`;
  return `${orgName}: notify ${whom} of breach within ${formatHours(left)} (${b.title})`;
}

function alertBody(orgName: string, b: Breach, now: Date, link: string): string {
  const role = b.role as RegistrationRole;
  const whom = NOTIFY_WHOM[role];
  const left = hoursLeft(b, now);
  const deadline = formatDateTime(notificationDeadline(b));
  return [
    `Hello,`,
    ``,
    `A personal data breach was logged for ${orgName}: "${b.title}".`,
    `Became aware: ${formatDateTime(b.discoveredAt)} (Nairobi time)`,
    ``,
    left >= 0
      ? `Under s.43 of the Data Protection Act you must notify ${whom} within ${NOTIFY_WITHIN_HOURS[role]} hours of becoming aware, by ${deadline}. That is ${formatHours(left)} from now.`
      : `The ${NOTIFY_WITHIN_HOURS[role]}-hour deadline to notify ${whom} passed at ${deadline}. Notify now, and include the reasons for the delay.`,
    role === "controller"
      ? `If you assess that the breach is unlikely to cause harm, record your reasoning and these alerts will stop.`
      : `As a processor, you must tell the controller whatever the level of risk.`,
    ``,
    `Assess the breach and draft the notification here:`,
    link,
  ].join("\n");
}
