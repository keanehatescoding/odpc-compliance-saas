import { addDays, daysBetween } from "./dates";
import { formatDaysLeft } from "./subject-request";

// What the Office of the Data Protection Commissioner sends an organisation
// when someone complains about it, or when it acts on what it found: the
// notification of a complaint, an enforcement notice, a penalty notice, or a
// demand for information. From ss.56–58 and 62–63 of the Data Protection Act,
// 2019 and the Data Protection (Complaints Handling Procedure and Enforcement)
// Regulations, 2021. Plain-language summary; check against the notice itself
// and current ODPC guidance before relying on it.

export interface ComplaintKindInfo {
  label: string;
  /** For sentences: "the ODPC complaint". */
  short: string;
  /** What has to be done by the deadline: "Respond to the ODPC complaint". */
  todo: string;
  /** The same as a past participle: "not responded to", "not complied with". */
  undone: string;
  /** Days from receipt to act, where the law fixes them. Otherwise the notice says. */
  days?: number;
  provision: string;
  /** What the deadline asks for, and what follows from missing it. */
  guidance: string;
}

export const COMPLAINT_KINDS = {
  complaint: {
    label: "Notification of a complaint",
    short: "complaint",
    todo: "Respond to",
    undone: "not responded to",
    days: 21,
    provision: "reg. 11 of the Complaints Handling Procedure and Enforcement Regulations",
    guidance:
      "Send the ODPC your side of it with the evidence, say whether you can settle it with the person directly, and describe what you have put in place to deal with complaints like it. If you say nothing, the ODPC decides on the complainant's account alone.",
  },
  enforcement_notice: {
    label: "Enforcement notice",
    short: "enforcement notice",
    todo: "Comply with",
    undone: "not complied with",
    provision: "s.58 of the Data Protection Act",
    guidance:
      "Take the steps the notice sets out within the time it gives, which must be at least 21 days. Not complying is an offence (a fine of up to KSh 5 million, up to two years in prison, or both) and can lead to a penalty notice.",
  },
  penalty_notice: {
    label: "Penalty notice",
    short: "penalty notice",
    todo: "Pay or appeal",
    undone: "not paid or appealed",
    provision: "ss.62–63 of the Data Protection Act",
    guidance:
      "Pay the amount by the date the notice gives, or appeal to the High Court. A penalty can be up to KSh 5 million or 1% of last year's turnover, whichever is lower.",
  },
  information: {
    label: "Request for information or documents",
    short: "request for information",
    todo: "Answer",
    undone: "not answered",
    provision: "s.57 of the Data Protection Act",
    guidance:
      "Give the ODPC what it asks for by the date in the letter. Refusing or failing to, without a reasonable excuse, is an offence.",
  },
} as const satisfies Record<string, ComplaintKindInfo>;

export type ComplaintKind = keyof typeof COMPLAINT_KINDS;
export const COMPLAINT_KIND_KEYS = Object.keys(COMPLAINT_KINDS) as ComplaintKind[];

export const COMPLAINT_KIND_LABELS = Object.fromEntries(COMPLAINT_KIND_KEYS.map((k) => [k, COMPLAINT_KINDS[k].label])) as Record<
  ComplaintKind,
  string
>;

/** Within this many days of the deadline a complaint counts as due soon. */
export const DUE_SOON_DAYS = 5;

/** Days the ODPC has to investigate and conclude a complaint (s.56(5)). */
export const CONCLUSION_DAYS = 90;

/** Days to appeal a decision to the High Court, as ODPC determinations state. */
export const APPEAL_DAYS = 30;

export interface ComplaintLike {
  kind: ComplaintKind | string;
  receivedOn: string;
  dueOn: string;
  respondedOn: string | null;
  closedOn: string | null;
}

export function kindInfo(kind: string): ComplaintKindInfo {
  return (COMPLAINT_KINDS as Record<string, ComplaintKindInfo>)[kind] ?? COMPLAINT_KINDS.complaint;
}

/** The deadline the law sets for this kind, as YYYY-MM-DD, or null where only the notice says. */
export function defaultDueOn(kind: string, receivedOn: string): string | null {
  const { days } = kindInfo(kind);
  return days === undefined ? null : addDays(receivedOn, days);
}

/**
 * The deadline to save on an edit. One that was the law's default and was left
 * as it was moves with a corrected received date; a date typed in from the
 * letter, or changed in this edit, is kept.
 */
export function dueOnAfterEdit(
  before: Pick<ComplaintLike, "kind" | "receivedOn" | "dueOn">,
  after: Pick<ComplaintLike, "kind" | "receivedOn" | "dueOn">,
): string {
  const wasDefault = before.dueOn === defaultDueOn(before.kind, before.receivedOn);
  if (!wasDefault || after.dueOn !== before.dueOn) return after.dueOn;
  return defaultDueOn(after.kind, after.receivedOn) ?? after.dueOn;
}

/** Days from today to the deadline (0 on the day, negative once passed). */
export function daysToAct(c: Pick<ComplaintLike, "dueOn">, today: string): number {
  return daysBetween(today, c.dueOn);
}

export type ComplaintStatus = "open" | "due_soon" | "overdue" | "responded" | "closed";

export function complaintStatus(c: ComplaintLike, today: string): ComplaintStatus {
  if (c.closedOn) return "closed";
  if (c.respondedOn) return "responded";
  const left = daysToAct(c, today);
  if (left < 0) return "overdue";
  return left <= DUE_SOON_DAYS ? "due_soon" : "open";
}

export const COMPLAINT_STATUS_LABEL: Record<ComplaintStatus, string> = {
  open: "Response due",
  due_soon: "Due soon",
  overdue: "Overdue",
  responded: "Awaiting the ODPC",
  closed: "Closed",
};

/** Still waiting on the organisation, not on the ODPC. */
export function awaitsResponse(status: ComplaintStatus): boolean {
  return status === "open" || status === "due_soon" || status === "overdue";
}

/** Responded after the deadline. */
export function respondedLate(c: Pick<ComplaintLike, "dueOn" | "respondedOn">): boolean {
  return Boolean(c.respondedOn && c.respondedOn > c.dueOn);
}

export { formatDaysLeft };

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export type ComplaintAlertKind = "due_soon" | "overdue";

/**
 * The alert email to send now, or null: once when the deadline is close, and
 * once when it has passed. As with data subject requests only the most urgent
 * stage goes out, so a notice logged late gets the overdue email alone.
 */
export function dueComplaintAlert(c: ComplaintLike, today: string, alreadySent: ReadonlySet<string>): ComplaintAlertKind | null {
  const status = complaintStatus(c, today);
  if (status !== "due_soon" && status !== "overdue") return null;
  return alreadySent.has(status) ? null : status;
}
