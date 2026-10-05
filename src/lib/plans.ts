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
