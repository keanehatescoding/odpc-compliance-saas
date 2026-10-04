import { and, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import { memberships, organizations, registrations, reminderLog, users } from "@/db/schema";
import { daysBetween, formatDate, todayInKenya } from "./dates";
import { ODPC_FEES, formatKsh, type OrgSize } from "./dpa";
import type { SendEmail } from "./email";
import { dueReminderThreshold, reminderSubject, renewalFiled } from "./registration";

export interface ReminderRunResult {
  checked: number;
  sent: { registrationId: string; threshold: number; to: string[] }[];
  failed: { registrationId: string; error: string }[];
}

/**
 * Sends any renewal reminders due today. Safe to run as often as you like: a
 * reminder is claimed in reminder_log before the email goes out, so
 * overlapping runs cannot double-send. If sending fails the claim is released
 * so the next run retries.
 */
export async function runReminders(
  db: Db,
  sendEmail: SendEmail,
  opts: { today?: string; appUrl?: string } = {},
): Promise<ReminderRunResult> {
  const today = opts.today ?? todayInKenya();
  const appUrl = opts.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  const result: ReminderRunResult = { checked: 0, sent: [], failed: [] };

  const regs = await db
    .select({ reg: registrations, org: organizations })
    .from(registrations)
    .innerJoin(organizations, eq(organizations.id, registrations.orgId))
    .where(isNotNull(registrations.expiresOn));

  for (const { reg, org } of regs) {
    result.checked++;
    const expiresOn = reg.expiresOn!;
    if (renewalFiled(reg)) continue;

    const sentRows = await db
      .select({ t: reminderLog.thresholdDays })
      .from(reminderLog)
      .where(and(eq(reminderLog.registrationId, reg.id), eq(reminderLog.expiresOn, expiresOn)));
    const threshold = dueReminderThreshold(expiresOn, today, new Set(sentRows.map((r) => r.t)));
    if (threshold === null) continue;

    const to = await reminderRecipients(db, org);
    if (to.length === 0) continue;

    const claimed = await db
      .insert(reminderLog)
      .values({ registrationId: reg.id, expiresOn, thresholdDays: threshold, recipients: to })
      .onConflictDoNothing()
      .returning({ id: reminderLog.id });
    if (claimed.length === 0) continue; // another run got there first

    const daysLeft = daysBetween(today, expiresOn);
    const role = reg.role; // "controller" | "processor"
    try {
      await sendEmail({
        to,
        subject: reminderSubject(org.name, role, daysLeft),
        text: reminderBody({
          orgName: org.name,
          role,
          certificateNumber: reg.certificateNumber,
          expiresOn,
          daysLeft,
          renewalFee: ODPC_FEES[org.size as OrgSize].renewal,
          link: `${appUrl}/registrations`,
        }),
      });
      result.sent.push({ registrationId: reg.id, threshold, to });
    } catch (err) {
      await db.delete(reminderLog).where(eq(reminderLog.id, claimed[0].id));
      result.failed.push({ registrationId: reg.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}

/** Where compliance emails go: the organisation's reminder address, else its owners with verified emails. */
export async function reminderRecipients(db: Db, org: typeof organizations.$inferSelect): Promise<string[]> {
  if (org.reminderEmail) {
    return org.reminderEmail
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const rows = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, org.id), eq(memberships.role, "owner"), isNotNull(users.emailVerifiedAt)));
  return rows.map((r) => r.email);
}

function reminderBody(p: {
  orgName: string;
  role: string;
  certificateNumber: string | null;
  expiresOn: string;
  daysLeft: number;
  renewalFee: number;
  link: string;
}): string {
  const cert = p.certificateNumber ? ` (certificate ${p.certificateNumber})` : "";
  const when =
    p.daysLeft >= 0
      ? `expires on ${formatDate(p.expiresOn)}, ${p.daysLeft === 0 ? "today" : `in ${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"}`}`
      : `expired on ${formatDate(p.expiresOn)}`;
  const lines = [
    `Hello,`,
    ``,
    `${p.orgName}'s ODPC data ${p.role} registration${cert} ${when}.`,
    ``,
    p.daysLeft >= 0
      ? `Renew through the ODPC registration portal before it lapses. Processing personal data without a valid registration can lead to enforcement action and fines of up to KSh 5 million or 1% of annual turnover.`
      : `Operating without a valid registration exposes ${p.orgName} to ODPC enforcement. Renew through the ODPC registration portal as soon as possible.`,
    ``,
    `Indicative renewal fee for your size band: ${formatKsh(p.renewalFee)}.`,
    ``,
    `Once you've applied, record the application date so these reminders stop:`,
    p.link,
  ];
  return lines.join("\n");
}
