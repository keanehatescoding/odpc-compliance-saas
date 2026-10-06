// Subscription plans and access rules. Shared by server code and pages, so
// kept free of database imports.
import type { OrgSize } from "./dpa";

export const TRIAL_DAYS = 14;

export const BILLING_INTERVALS = { month: "Monthly", year: "Annual" } as const;
export type BillingInterval = keyof typeof BILLING_INTERVALS;
export const BILLING_INTERVAL_KEYS = Object.keys(BILLING_INTERVALS) as BillingInterval[];

/**
 * Prices in KSh, by the organisation size set in Settings (the same bands as
 * the ODPC fee schedule). Annual is ten months' price: two months free.
 */
export const PLAN_PRICES: Record<OrgSize, Record<BillingInterval, number>> = {
  micro_small: { month: 3_000, year: 30_000 },
  medium: { month: 5_000, year: 50_000 },
  large: { month: 8_000, year: 80_000 },
};

/** `from` plus one month or one year, clamped to the end of a shorter month (31 Jan + 1 month = 28/29 Feb). */
export function addPeriod(from: Date, interval: BillingInterval): Date {
  const months = interval === "year" ? 12 : 1;
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export type AccessState = "trial" | "active" | "lapsed";

export interface Access {
  state: AccessState;
  /** When the trial or the last paid period ends (or ended). */
  endsAt: Date;
  /** Whole days left, rounded up; 0 once lapsed. */
  daysLeft: number;
}

/**
 * Where an organisation stands. Access runs to the later of the end of the
 * trial and the end of the last paid period. Once it lapses the app is
 * read-only, apart from breaches, the team and settings.
 */
export function accessFor(org: { trialEndsAt: Date; paidUntil: Date | null }, now: Date = new Date()): Access {
  const paidUntil = org.paidUntil;
  const endsAt = paidUntil && paidUntil > org.trialEndsAt ? paidUntil : org.trialEndsAt;
  const msLeft = endsAt.getTime() - now.getTime();
  if (msLeft <= 0) return { state: "lapsed", endsAt, daysLeft: 0 };
  return {
    state: paidUntil && paidUntil > now ? "active" : "trial",
    endsAt,
    daysLeft: Math.ceil(msLeft / 86_400_000),
  };
}

/** Paystack takes amounts in the currency's subunit (cents for KES). */
export function toSubunits(ksh: number): number {
  return Math.round(ksh * 100);
}

// ---------------------------------------------------------------------------
// Automatic renewal: a saved card is charged for another period as the current
// one ends. Up to three tries per period: a day before it ends, a day after,
// and three days after. Access lapses in between, as it would without renewal.
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

/** When each attempt is due, relative to the end of access. */
export const RENEWAL_ATTEMPT_OFFSETS_MS = [-DAY, DAY, 3 * DAY] as const;
export const RENEWAL_ATTEMPTS = RENEWAL_ATTEMPT_OFFSETS_MS.length;
/** If the job hasn't run for this long after access ended, don't charge for that period at all. */
export const RENEWAL_GIVE_UP_MS = 7 * DAY;

/**
 * The attempt (1-based) due at `now` for access ending at `endsAt`: the latest
 * one whose time has come, so a job that missed a run catches up with one
 * charge, not several.
 */
export function dueRenewalAttempt(endsAt: Date, now: Date): number | null {
  const since = now.getTime() - endsAt.getTime();
  if (since > RENEWAL_GIVE_UP_MS) return null;
  for (let n = RENEWAL_ATTEMPTS; n >= 1; n--) {
    if (since >= RENEWAL_ATTEMPT_OFFSETS_MS[n - 1]) return n;
  }
  return null;
}

/** When the attempt after `attempt` is due, or null if that was the last. */
export function nextRenewalAttemptAt(endsAt: Date, attempt: number): Date | null {
  return attempt < RENEWAL_ATTEMPTS ? new Date(endsAt.getTime() + RENEWAL_ATTEMPT_OFFSETS_MS[attempt]) : null;
}

export interface CardDetails {
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

/** A card works to the end of its expiry month. One without a known expiry is assumed to work. */
export function cardUsable(card: CardDetails, at: Date): boolean {
  if (!card.expMonth || !card.expYear) return true;
  return at.getTime() < Date.UTC(card.expYear, card.expMonth, 1);
}

/** E.g. "Visa ending 4242". */
export function cardLabel(card: CardDetails): string {
  const brand = card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : "Card";
  return card.last4 ? `${brand} ending ${card.last4}` : `saved ${brand === "Card" ? "card" : brand}`;
}

/** E.g. "09/2027". */
export function cardExpiry(card: CardDetails): string | null {
  return card.expMonth && card.expYear ? `${String(card.expMonth).padStart(2, "0")}/${card.expYear}` : null;
}

/**
 * Whether the period ending at `endsAt` will be renewed automatically: renewal
 * is on and the saved card hasn't expired by then.
 */
export function willAutoRenew(
  org: { autoRenewInterval: string | null },
  card: CardDetails | null,
  endsAt: Date,
): org is { autoRenewInterval: BillingInterval } {
  return org.autoRenewInterval !== null && card !== null && cardUsable(card, endsAt);
}
