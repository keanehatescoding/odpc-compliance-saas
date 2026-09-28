import { addMonths, daysBetween } from "./dates";

/**
 * Registration certificates issued under the Data Protection (Registration of
 * Data Controllers and Data Processors) Regulations, 2021 are valid for 24
 * months. Kept as a constant so it is easy to change if the ODPC revises it.
 */
export const CERTIFICATE_VALIDITY_MONTHS = 24;

/** Days before expiry at which a registration counts as "renewal due". */
export const RENEWAL_WINDOW_DAYS = 90;
/** Days before expiry at which it becomes urgent. */
export const URGENT_WINDOW_DAYS = 30;

export type RegistrationStatus =
  | "not_started" // nothing filed yet
  | "applied" // application submitted, certificate not yet issued
  | "active"
  | "renewal_due"
  | "expiring_soon"
  | "expired";

export interface RegistrationLike {
  appliedOn: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
}

export function defaultExpiry(issuedOn: string): string {
  return addMonths(issuedOn, CERTIFICATE_VALIDITY_MONTHS);
}

/**
 * True when an application was filed after the current certificate was
 * issued, i.e. the organisation has already applied to renew.
 */
export function renewalFiled(reg: RegistrationLike): boolean {
  return Boolean(reg.appliedOn && reg.issuedOn && reg.appliedOn > reg.issuedOn);
}

export function registrationStatus(reg: RegistrationLike, today: string): RegistrationStatus {
  if (reg.expiresOn) {
    const left = daysBetween(today, reg.expiresOn);
    if (left <= RENEWAL_WINDOW_DAYS && renewalFiled(reg)) return "applied";
    if (left < 0) return "expired";
    if (left <= URGENT_WINDOW_DAYS) return "expiring_soon";
    if (left <= RENEWAL_WINDOW_DAYS) return "renewal_due";
    return "active";
  }
  if (reg.appliedOn) return "applied";
  return "not_started";
}

export function daysUntilExpiry(reg: RegistrationLike, today: string): number | null {
  return reg.expiresOn ? daysBetween(today, reg.expiresOn) : null;
}

export const STATUS_LABEL: Record<RegistrationStatus, string> = {
  not_started: "Not registered",
  applied: "Application pending",
  active: "Active",
  renewal_due: "Renewal due",
  expiring_soon: "Expiring soon",
  expired: "Expired",
};

/** Higher is worse; used to sort and to pick an organisation's headline status. */
export const STATUS_SEVERITY: Record<RegistrationStatus, number> = {
  active: 0,
  applied: 1,
  renewal_due: 2,
  expiring_soon: 3,
  not_started: 4,
  expired: 5,
};

export function worstStatus(statuses: RegistrationStatus[]): RegistrationStatus {
  if (statuses.length === 0) return "not_started";
  return statuses.reduce((a, b) => (STATUS_SEVERITY[b] > STATUS_SEVERITY[a] ? b : a));
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

/**
 * Days-before-expiry thresholds that trigger a reminder email. Negative values
 * are post-expiry follow-ups. Each threshold fires at most once per
 * certificate (keyed by its expiry date), so a renewed certificate starts a
 * fresh cycle.
 */
export const REMINDER_THRESHOLDS = [90, 60, 30, 14, 7, 1, 0, -7, -14, -30] as const;

/**
 * The threshold whose reminder should go out today, or null if none.
 *
 * We send only the most recent threshold crossed. A registration first entered
 * with 20 days left gets the 30-day reminder, not the 90/60/30 ones at once.
 * Threshold values in `alreadySent` are skipped.
 */
export function dueReminderThreshold(
  expiresOn: string,
  today: string,
  alreadySent: ReadonlySet<number>,
): number | null {
  const left = daysBetween(today, expiresOn);
  let current: number | null = null;
  for (const t of REMINDER_THRESHOLDS) {
    if (left <= t) current = t; // thresholds are descending, so this ends at the smallest crossed
  }
  if (current === null || alreadySent.has(current)) return null;
  return current;
}

export function reminderSubject(orgName: string, role: string, daysLeft: number): string {
  const what = `${orgName}: ODPC data ${role} registration`;
  if (daysLeft > 1) return `${what} expires in ${daysLeft} days`;
  if (daysLeft === 1) return `${what} expires tomorrow`;
  if (daysLeft === 0) return `${what} expires today`;
  return `${what} expired ${-daysLeft} day${daysLeft === -1 ? "" : "s"} ago`;
}
