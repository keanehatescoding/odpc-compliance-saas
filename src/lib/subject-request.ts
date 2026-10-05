import { addDays, daysBetween } from "./dates";

// Requests from data subjects exercising their rights under ss.26 and 34–40
// of the Data Protection Act, 2019. Response times come from the Data
// Protection (General) Regulations, 2021, counted in calendar days from the
// day the request was received. Plain-language summary; check against
// current ODPC guidance before relying on it.

export interface RequestKindInfo {
  label: string;
  /** For sentences: "Achieng's access request". */
  short: string;
  /** Days from receipt to respond. */
  days: number;
  regulation: string;
  /** Days to tell the person in writing, with reasons, if you decline. */
  declineDays?: number;
  /** What to tell the person, or check, when declining. */
  declineNote?: string;
}

export const REQUEST_KINDS = {
  access: {
    label: "Access to their data",
    short: "access request",
    days: 7,
    regulation: "reg. 9",
  },
  rectification: {
    label: "Correct their data",
    short: "correction request",
    days: 14,
    regulation: "reg. 10",
    declineDays: 7,
  },
  erasure: {
    label: "Delete their data",
    short: "erasure request",
    days: 14,
    regulation: "reg. 12",
    declineNote:
      "Erasure can be refused only where you must keep the data: for freedom of expression, a legal obligation, a public-interest task, archiving or research, or a legal claim.",
  },
  restriction: {
    label: "Restrict processing",
    short: "restriction request",
    days: 14,
    regulation: "reg. 7",
    declineNote: "Only a manifestly unfounded or excessive request can be declined. Give your reasons in writing.",
  },
  objection: {
    label: "Object to processing",
    short: "objection",
    days: 14,
    regulation: "reg. 8",
    declineNote:
      "An objection to direct marketing can't be declined. For anything else, give your reasons and tell them they can complain to the Data Commissioner.",
  },
  portability: {
    label: "Move their data to another organisation",
    short: "portability request",
    days: 30,
    regulation: "reg. 11",
    declineDays: 7,
  },
  marketing: {
    label: "Stop sharing for third-party marketing",
    short: "marketing opt-out",
    days: 7,
    regulation: "reg. 18",
  },
} as const satisfies Record<string, RequestKindInfo>;

export type RequestKind = keyof typeof REQUEST_KINDS;
export const REQUEST_KIND_KEYS = Object.keys(REQUEST_KINDS) as RequestKind[];

export const REQUEST_KIND_LABELS = Object.fromEntries(REQUEST_KIND_KEYS.map((k) => [k, REQUEST_KINDS[k].label])) as Record<
  RequestKind,
  string
>;

export const REQUEST_OUTCOMES = {
  completed: "Done as asked",
  declined: "Declined",
} as const;

export type RequestOutcome = keyof typeof REQUEST_OUTCOMES;
export const REQUEST_OUTCOME_KEYS = Object.keys(REQUEST_OUTCOMES) as RequestOutcome[];

/** Within this many days of the deadline a request counts as due soon. */
export const DUE_SOON_DAYS = 2;

export interface RequestLike {
  kind: RequestKind | string;
  receivedOn: string;
  outcome: RequestOutcome | string | null;
  respondedOn: string | null;
}

export function kindInfo(kind: string): RequestKindInfo {
  return (REQUEST_KINDS as Record<string, RequestKindInfo>)[kind] ?? REQUEST_KINDS.access;
}

/** The last day to respond, as YYYY-MM-DD. */
export function responseDueOn(r: Pick<RequestLike, "kind" | "receivedOn">): string {
  return addDays(r.receivedOn, kindInfo(r.kind).days);
}

/** Days from today to the deadline (0 on the day, negative once passed). */
export function daysToRespond(r: Pick<RequestLike, "kind" | "receivedOn">, today: string): number {
  return daysBetween(today, responseDueOn(r));
}

export type RequestStatus = "open" | "due_soon" | "overdue" | "completed" | "declined";

export function requestStatus(r: RequestLike, today: string): RequestStatus {
  if (r.outcome === "completed" || r.outcome === "declined") return r.outcome;
  const left = daysToRespond(r, today);
  if (left < 0) return "overdue";
  return left <= DUE_SOON_DAYS ? "due_soon" : "open";
}

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  open: "Response due",
  due_soon: "Due soon",
  overdue: "Overdue",
  completed: "Completed",
  declined: "Declined",
};

export function isOpen(status: RequestStatus): boolean {
  return status === "open" || status === "due_soon" || status === "overdue";
}

/** Responded after the deadline. */
export function respondedLate(r: RequestLike): boolean {
  return Boolean(r.respondedOn && r.respondedOn > responseDueOn(r));
}

/** "3 days left" / "due today" / "2 days overdue". */
export function formatDaysLeft(days: number): string {
  if (days === 0) return "due today";
  const n = Math.abs(days);
  return `${n} day${n === 1 ? "" : "s"} ${days > 0 ? "left" : "overdue"}`;
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export type RequestAlertKind = "due_soon" | "overdue";

/**
 * The alert email to send now, or null: once when the deadline is close, and
 * once when it has passed. As with breach alerts only the most urgent stage
 * goes out, so a request logged late gets the overdue email alone.
 */
export function dueRequestAlert(r: RequestLike, today: string, alreadySent: ReadonlySet<string>): RequestAlertKind | null {
  const status = requestStatus(r, today);
  if (status !== "due_soon" && status !== "overdue") return null;
  return alreadySent.has(status) ? null : status;
}
