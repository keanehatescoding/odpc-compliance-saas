import { daysBetween } from "./dates";
import { LAWFUL_BASES, type LawfulBasis } from "./dpa";

// How the organisation asks for consent and proves it was given. Under s.32
// of the Data Protection Act, 2019 the controller bears the burden of proving
// consent, the data subject may withdraw it at any time, and consent isn't
// freely given if a contract or service is made conditional on agreeing to
// processing it doesn't need. Section 33 requires a parent's or guardian's
// consent before a child's data is processed. Plain-language summary; check
// against current ODPC guidance before relying on it.

export const CONSENT_METHODS = {
  written: "Signed paper form",
  online: "Online form or tick-box",
  sms: "SMS or USSD opt-in",
  verbal: "Spoken, with a recording or note",
  other: "Another way",
} as const;

export type ConsentMethod = keyof typeof CONSENT_METHODS;
export const CONSENT_METHOD_KEYS = Object.keys(CONSENT_METHODS) as ConsentMethod[];

export interface ConsentLike {
  wording: string;
  evidence: string;
  withdrawal: string;
  reviewOn: string | null;
}

export type ConsentStatus = "incomplete" | "review_due" | "in_place";

/**
 * Whether the record could show consent was given. Without the wording, where
 * the proof is kept and a way to withdraw, it can't. A review date that has
 * arrived counts as due.
 */
export function consentStatus(c: ConsentLike, today: string): ConsentStatus {
  if (!c.wording || !c.evidence || !c.withdrawal) return "incomplete";
  return c.reviewOn && c.reviewOn <= today ? "review_due" : "in_place";
}

export const CONSENT_STATUS_LABEL: Record<ConsentStatus, string> = {
  incomplete: "Proof incomplete",
  review_due: "Review due",
  in_place: "In place",
};

/** Days from today to the review (negative once passed), or null when none is set. */
export function daysToConsentReview(c: ConsentLike, today: string): number | null {
  return c.reviewOn ? daysBetween(today, c.reviewOn) : null;
}

/** What consent must be to count, as a checklist for whoever writes or reviews the wording. */
export const VALID_CONSENT = [
  "Express: the person does something to agree. Silence, a pre-ticked box or carrying on using a service is not consent",
  "Free: they can say no without losing a service that doesn't need the data",
  "Specific: one purpose per request, asked separately from your other terms",
  "Informed: they know who you are, what data you'll use, what for and who else gets it",
  "As easy to withdraw as it was to give, at any time",
  "Provable: you can show who agreed, when, and to which wording",
] as const;

export interface ConsentGapInput {
  wording: string;
  evidence: string;
  withdrawal: string;
  parental: boolean;
  guardianCheck: string;
  conditional: boolean;
}

export interface ConsentActivity {
  name: string;
  lawfulBasis: string;
  involvesChildren: boolean;
}

/**
 * What the record still needs before it shows consent was properly asked for.
 * `activity` is the RoPA activity that relies on it, or null when there is none.
 */
export function consentGaps(c: ConsentGapInput, activity: ConsentActivity | null): string[] {
  const gaps: string[] = [];
  if (!c.wording) gaps.push("Record the exact wording people agree to. You can't show what someone consented to without it.");
  if (!c.evidence) gaps.push("Say where the proof is kept. Section 32 of the Act puts the burden of proving consent on you.");
  if (!c.withdrawal) gaps.push("Say how someone withdraws their consent. They can at any time, and it should be as easy as agreeing was.");
  if (!activity) {
    gaps.push("Link the processing activity that relies on this consent.");
  } else {
    if (activity.lawfulBasis !== "consent") {
      gaps.push(
        `Your RoPA gives “${LAWFUL_BASES[activity.lawfulBasis as LawfulBasis] ?? activity.lawfulBasis}” as the lawful basis for ${activity.name}, not consent. Update whichever is wrong.`,
      );
    }
    if (activity.involvesChildren && !c.parental) {
      gaps.push(`${activity.name} involves children's data. Section 33 of the Act needs the consent of a parent or guardian.`);
    }
  }
  if (c.parental && !c.guardianCheck) gaps.push("Say how you check that the person agreeing is the child's parent or guardian.");
  if (c.conditional) {
    gaps.push(
      "People are refused the service unless they agree. Under section 32(4) that may not count as freely given unless the service needs the data. Consider making it optional or relying on another lawful basis.",
    );
  }
  return gaps;
}

/** Whether it falls to the organisation to get consent for the activity: not when it only processes for someone else. */
export function reliesOnConsent(a: { lawfulBasis: string; role?: string | null }): boolean {
  return a.lawfulBasis === "consent" && a.role !== "processor";
}

/** The activities that rely on consent but have no consent record behind them. */
export function activitiesWithoutConsent<A extends { id: string; lawfulBasis: string; role?: string | null }>(
  activities: A[],
  records: { activityId: string | null }[],
): A[] {
  const covered = new Set(records.map((r) => r.activityId));
  return activities.filter((a) => reliesOnConsent(a) && !covered.has(a.id));
}
