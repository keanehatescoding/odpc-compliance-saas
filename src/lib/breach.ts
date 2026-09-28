import { formatDateTime } from "./dates";
import type { RegistrationRole } from "./dpa";

// Personal data breaches under s.43 of the Data Protection Act, 2019. A
// controller notifies the Data Commissioner within 72 hours of becoming aware
// of a breach that carries a real risk of harm, and tells affected people. A
// processor tells its controller within 48 hours. Plain-language summary;
// check against current ODPC guidance before relying on it.

export const BREACH_KINDS = {
  unauthorised_access: "Unauthorised access (hacking, stolen login)",
  misdirected: "Sent to the wrong person (email, SMS, WhatsApp)",
  loss_theft: "Lost or stolen device or paper records",
  ransomware: "Ransomware or other malware",
  insider: "Staff misuse or snooping",
  disclosure: "Published or disclosed by mistake",
  destruction: "Accidental deletion, alteration or destruction",
  other: "Other",
} as const;

export type BreachKind = keyof typeof BREACH_KINDS;
export const BREACH_KIND_KEYS = Object.keys(BREACH_KINDS) as BreachKind[];

export const BREACH_RISKS = {
  unassessed: "Not yet assessed",
  unlikely: "Unlikely to result in harm",
  real_risk: "Real risk of harm to data subjects",
} as const;

export type BreachRisk = keyof typeof BREACH_RISKS;
export const BREACH_RISK_KEYS = Object.keys(BREACH_RISKS) as BreachRisk[];

/** Hours from discovery to the notification deadline, by the organisation's role. */
export const NOTIFY_WITHIN_HOURS: Record<RegistrationRole, number> = { controller: 72, processor: 48 };

/** Who must be notified, by role. */
export const NOTIFY_WHOM: Record<RegistrationRole, string> = {
  controller: "the ODPC",
  processor: "the data controller",
};

const HOUR = 3_600_000;

export interface BreachLike {
  role: RegistrationRole | string;
  discoveredAt: Date;
  risk: BreachRisk | string;
  dataUnintelligible: boolean;
  notifiedAt: Date | null;
  subjectsNotifiedAt: Date | null;
  closedAt: Date | null;
}

export function roleOf(b: Pick<BreachLike, "role">): RegistrationRole {
  return b.role === "processor" ? "processor" : "controller";
}

export function notificationDeadline(b: Pick<BreachLike, "role" | "discoveredAt">): Date {
  return new Date(b.discoveredAt.getTime() + NOTIFY_WITHIN_HOURS[roleOf(b)] * HOUR);
}

/**
 * Whether the breach must be notified. A processor always tells its
 * controller. A controller must notify unless it has assessed the risk as
 * unlikely; until it has assessed the risk, the clock is treated as running.
 */
export function notificationRequired(b: Pick<BreachLike, "role" | "risk">): boolean {
  return roleOf(b) === "processor" || b.risk !== "unlikely";
}

/**
 * Whether affected people should be told directly. Not required when the data
 * was unintelligible to whoever got it (e.g. strong encryption).
 */
export function subjectNoticeRequired(b: Pick<BreachLike, "role" | "risk" | "dataUnintelligible">): boolean {
  return roleOf(b) === "controller" && b.risk === "real_risk" && !b.dataUnintelligible;
}

export type BreachStatus = "open" | "overdue" | "notified" | "not_required" | "closed";

export function breachStatus(b: BreachLike, now: Date): BreachStatus {
  if (b.closedAt) return "closed";
  if (b.notifiedAt) return "notified";
  if (!notificationRequired(b)) return "not_required";
  return now > notificationDeadline(b) ? "overdue" : "open";
}

export const BREACH_STATUS_LABEL: Record<BreachStatus, string> = {
  open: "Notification due",
  overdue: "Notification overdue",
  notified: "Notified",
  not_required: "Notification not required",
  closed: "Closed",
};

/** Whole hours until the deadline (negative once passed), rounded towards the deadline. */
export function hoursLeft(b: Pick<BreachLike, "role" | "discoveredAt">, now: Date): number {
  const ms = notificationDeadline(b).getTime() - now.getTime();
  return ms >= 0 ? Math.floor(ms / HOUR) : -Math.ceil(-ms / HOUR);
}

/** "41 hours" / "1 hour" / "under an hour". */
export function formatHours(hours: number): string {
  const h = Math.abs(hours);
  if (h === 0) return "under an hour";
  return `${h} hour${h === 1 ? "" : "s"}`;
}

/** Notification was (or will be) late, so the notice must explain why. */
export function notifiedLate(b: Pick<BreachLike, "role" | "discoveredAt" | "notifiedAt">): boolean {
  return Boolean(b.notifiedAt && b.notifiedAt > notificationDeadline(b));
}

/** Follow-up tasks still outstanding on an open breach. */
export function outstandingTasks(b: BreachLike): string[] {
  if (b.closedAt) return [];
  const tasks: string[] = [];
  if (b.risk === "unassessed") tasks.push("Assess the risk of harm to the people affected");
  if (notificationRequired(b) && !b.notifiedAt) tasks.push(`Notify ${NOTIFY_WHOM[roleOf(b)]}`);
  if (subjectNoticeRequired(b) && !b.subjectsNotifiedAt) tasks.push("Tell the people affected");
  return tasks;
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export type BreachAlertKind = "logged" | "deadline_24h" | "overdue";

/**
 * The alert email to send now, or null. Like renewal reminders, only the most
 * urgent stage is sent: a breach logged with 10 hours left gets the 24-hour
 * warning, not the "logged" email as well. No alerts once notified, closed or
 * assessed as not notifiable.
 */
export function dueBreachAlert(b: BreachLike, now: Date, alreadySent: ReadonlySet<string>): BreachAlertKind | null {
  const status = breachStatus(b, now);
  if (status !== "open" && status !== "overdue") return null;
  const left = notificationDeadline(b).getTime() - now.getTime();
  const kind: BreachAlertKind = left < 0 ? "overdue" : left <= 24 * HOUR ? "deadline_24h" : "logged";
  return alreadySent.has(kind) ? null : kind;
}

// ---------------------------------------------------------------------------
// Draft notifications
// ---------------------------------------------------------------------------

export interface NoticeSection {
  heading: string;
  body: string;
  /** True when the section still needs information. */
  missing?: boolean;
}

export interface NoticeBreach extends BreachLike {
  kind: string;
  description: string;
  occurredAt: Date | null;
  dataSubjects: string;
  approxSubjects: number | null;
  dataCategories: string;
  sensitiveCategories: string[];
  riskNotes: string;
  measures: string;
  subjectAdvice: string;
  unauthorisedParty: string;
  contactPerson: string;
  delayReason: string;
}

const TBC = "[To be confirmed]";

function section(heading: string, body: string): NoticeSection {
  return body.trim() ? { heading, body: body.trim() } : { heading, body: TBC, missing: true };
}

function kindLabel(kind: string): string {
  return BREACH_KINDS[kind as BreachKind] ?? kind;
}

/**
 * The contents of a breach notification to the Data Commissioner (or, for a
 * processor, to the controller), following the particulars s.43 asks for.
 * Gaps are marked so the organisation can send what it knows now and follow up.
 */
export function notificationSections(
  b: NoticeBreach,
  ctx: { orgName: string; certificateNumber?: string | null; activities: string[]; now: Date },
): NoticeSection[] {
  const affected = [
    b.dataSubjects && `People affected: ${b.dataSubjects}`,
    `Approximate number: ${b.approxSubjects ?? "not yet known"}`,
    b.dataCategories && `Personal data involved: ${b.dataCategories}`,
    b.sensitiveCategories.length > 0 && `Sensitive personal data: ${b.sensitiveCategories.join(", ")}`,
    b.dataUnintelligible && "The data was encrypted or otherwise unintelligible to the unauthorised party.",
    ctx.activities.length > 0 && `Processing activities affected: ${ctx.activities.join(", ")}`,
  ].filter(Boolean) as string[];

  const sections: NoticeSection[] = [
    {
      heading: "Organisation",
      body: [ctx.orgName, ctx.certificateNumber && `ODPC registration certificate ${ctx.certificateNumber}`]
        .filter(Boolean)
        .join("\n"),
    },
    {
      heading: "Nature of the breach",
      body: [
        `Type: ${kindLabel(b.kind)}`,
        `Occurred: ${b.occurredAt ? formatDateTime(b.occurredAt) : "not yet known"}`,
        `Became aware: ${formatDateTime(b.discoveredAt)}`,
        "",
        b.description,
      ].join("\n"),
    },
    { heading: "Data and people affected", body: affected.join("\n"), missing: !b.dataSubjects || !b.dataCategories },
    section("Likely consequences", b.riskNotes),
    section("Measures taken or proposed", b.measures),
    section("Recommended steps for affected people", b.subjectAdvice),
    // "Not known" is a complete answer here, so it isn't flagged as a gap.
    { heading: "Identity of the unauthorised party", body: b.unauthorisedParty.trim() || "Not known" },
    section("Contact person", b.contactPerson),
  ];
  if (notifiedLate(b) || (!b.notifiedAt && ctx.now > notificationDeadline(b))) {
    sections.push(section("Reasons for the delay", b.delayReason));
  }
  return sections;
}

/** A plain-language notice to the people affected. */
export function subjectNoticeSections(b: NoticeBreach, ctx: { orgName: string }): NoticeSection[] {
  const data = [b.dataCategories, b.sensitiveCategories.join(", ")].filter(Boolean).join(", ");
  return [
    {
      heading: "What happened",
      body: `On ${formatDateTime(b.discoveredAt)} ${ctx.orgName} became aware of a personal data breach. ${b.description}`,
    },
    section("What information was involved", data),
    section("What we are doing", b.measures),
    section("What you can do", b.subjectAdvice),
    section("Who to contact", b.contactPerson),
  ];
}
