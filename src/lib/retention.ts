import { addDays, addMonths, todayInKenya } from "./dates";
import { countsAsRound } from "./disposal";

// How long an activity keeps personal data, in a form Kinga can count with.
// Section 39 of the Data Protection Act, 2019 says personal data is kept only
// as long as its purpose needs. The RoPA's free-text retention period says that
// in the organisation's own words, and stays what the privacy notice shows.
// Alongside it, an activity can give the period as a length and what it's
// counted from ("7 years from the end of employment"). Kinga holds no personal
// data, so it can't tell when any one record's period ends; what it can say is
// where the line falls on a given day, and when the data should next be gone
// through. Periods like "until consent is withdrawn" or "per the Ministry's
// guidelines" have no fixed length and stay free text only.

export const RETENTION_UNITS = {
  days: "Days",
  months: "Months",
  years: "Years",
} as const;

export type RetentionUnit = keyof typeof RETENTION_UNITS;
export const RETENTION_UNIT_KEYS = Object.keys(RETENTION_UNITS) as RetentionUnit[];

/** The longest a period may be: past this it's "kept permanently", which belongs in the free text. */
export const MAX_RETENTION_YEARS = 100;

/**
 * The longest gap between disposal rounds, however long the period. Data passes
 * its period continuously, so a round once a year keeps anything from
 * overstaying by more than a year.
 */
export const MAX_ROUND_MONTHS = 12;

export interface RetentionPeriodLike {
  retentionLength: number | null;
  retentionUnit: string | null;
  retentionFrom: string;
}

type Scheduled = { retentionLength: number; retentionUnit: RetentionUnit; retentionFrom: string };

/** Whether the activity gives its period as a length Kinga can count with. */
export function hasRetentionSchedule<T extends RetentionPeriodLike>(p: T): p is T & Scheduled {
  return p.retentionLength !== null && p.retentionLength > 0 && p.retentionUnit !== null && p.retentionUnit in RETENTION_UNITS;
}

/** Moves a date by the period, forwards (1) or back (-1). */
function shift(date: string, p: Scheduled, sign: 1 | -1): string {
  const n = p.retentionLength * sign;
  if (p.retentionUnit === "days") return addDays(date, n);
  return addMonths(date, p.retentionUnit === "years" ? n * 12 : n);
}

/** The period's length in words: "30 days", "1 year". */
export function retentionLengthText(p: RetentionPeriodLike): string | null {
  if (!hasRetentionSchedule(p)) return null;
  const unit = p.retentionUnit.slice(0, -1);
  return `${p.retentionLength} ${p.retentionLength === 1 ? unit : `${unit}s`}`;
}

/** The period in words: "7 years from the end of employment", or null when it has no fixed length. */
export function describeRetention(p: RetentionPeriodLike): string | null {
  const length = retentionLengthText(p);
  if (!length) return null;
  return p.retentionFrom ? `${length} from ${p.retentionFrom}` : length;
}

/**
 * Where the line falls on a given day: anything counted from before this date
 * has been kept longer than the period. Null when the period has no fixed length.
 */
export function retentionCutoff(p: RetentionPeriodLike, on: string): string | null {
  return hasRetentionSchedule(p) ? shift(on, p, -1) : null;
}

/** True when a round every period would be more than a year apart, so rounds are yearly instead. */
function roundsAreYearly(p: Scheduled): boolean {
  const from = "2000-01-01";
  return shift(from, p, 1) > addMonths(from, MAX_ROUND_MONTHS);
}

/** How often to go through the data, in words: "every 30 days", "every year". */
export function roundIntervalText(p: RetentionPeriodLike): string | null {
  if (!hasRetentionSchedule(p)) return null;
  return roundsAreYearly(p) ? "every year" : `every ${retentionLengthText(p)}`;
}

/**
 * When to go through the data again after a round on `from`: once the period
 * has passed, or after a year if that comes first.
 */
export function nextRoundOn(p: RetentionPeriodLike, from: string): string | null {
  if (!hasRetentionSchedule(p)) return null;
  return roundsAreYearly(p) ? addMonths(from, MAX_ROUND_MONTHS) : shift(from, p, 1);
}

export interface ScheduleActivity extends RetentionPeriodLike {
  id: string;
  createdAt: Date;
}

export interface ScheduleDisposal {
  activityId: string | null;
  disposedOn: string;
  nextOn: string | null;
  reason: string;
}

export interface NextRound {
  on: string;
  /** "disposal" when the last round set its own date; "retention" when Kinga worked it out from the period. */
  source: "disposal" | "retention";
  due: boolean;
}

/**
 * When the activity's data should next be gone through. The last round's own
 * next date wins when it gave one. Otherwise, for a period Kinga can count
 * with, it's one interval after the last round, or after the activity was
 * added to the RoPA when no round is on record yet. Null when neither applies.
 */
export function activityNextRound(a: ScheduleActivity, disposals: ScheduleDisposal[], today: string): NextRound | null {
  const rounds = disposals.filter((d) => d.activityId === a.id && countsAsRound(d));
  const lastOn = rounds.reduce((max, d) => (d.disposedOn > max ? d.disposedOn : max), "");
  // Of two rounds on the same day, the one that set a next date speaks for both.
  const onLast = rounds.filter((d) => d.disposedOn === lastOn);
  const last = onLast.find((d) => d.nextOn) ?? onLast[0];
  if (last?.nextOn) return { on: last.nextOn, source: "disposal", due: last.nextOn <= today };
  const on = nextRoundOn(a, last?.disposedOn ?? todayInKenya(a.createdAt));
  return on ? { on, source: "retention", due: on <= today } : null;
}

export interface ActivityRetention extends RetentionPeriodLike {
  id: string;
  name: string;
  retentionPeriod: string;
}

/** The parts of an activity a form needs to talk about its retention period. */
export function retentionOf(a: ActivityRetention): ActivityRetention {
  const { id, name, retentionPeriod, retentionLength, retentionUnit, retentionFrom } = a;
  return { id, name, retentionPeriod, retentionLength, retentionUnit, retentionFrom };
}

/**
 * Activities whose retention period says a round is due and no disposal has
 * set a date of its own. A due date a disposal set is that disposal's to
 * report, so it isn't repeated here.
 */
export function retentionRoundsDue<T extends ScheduleActivity>(
  activities: T[],
  disposals: ScheduleDisposal[],
  today: string,
): { activity: T; on: string }[] {
  const due: { activity: T; on: string }[] = [];
  for (const a of activities) {
    const next = activityNextRound(a, disposals, today);
    if (next?.source === "retention" && next.due) due.push({ activity: a, on: next.on });
  }
  return due;
}
