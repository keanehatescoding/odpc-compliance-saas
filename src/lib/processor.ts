import { daysBetween } from "./dates";

// The outside organisations that handle personal data for this one. Under
// s.42(2) of the Data Protection Act, 2019 a controller using a processor
// must choose one that gives sufficient guarantees about its security
// measures, and the two must have a written contract saying the processor
// acts only on the controller's instructions and is bound by the controller's
// obligations. Plain-language summary; check against current ODPC guidance
// before relying on it.

export interface ProcessorLike {
  contractSignedOn: string | null;
  contractReviewOn: string | null;
}

export type ProcessorStatus = "no_contract" | "review_due" | "in_place";

/** Where the written contract stands. A review date that has arrived counts as due. */
export function processorStatus(p: ProcessorLike, today: string): ProcessorStatus {
  if (!p.contractSignedOn) return "no_contract";
  return p.contractReviewOn && p.contractReviewOn <= today ? "review_due" : "in_place";
}

export const PROCESSOR_STATUS_LABEL: Record<ProcessorStatus, string> = {
  no_contract: "No written contract",
  review_due: "Review due",
  in_place: "Contract in place",
};

/** Days from today to the contract review (negative once passed), or null when none is set. */
export function daysToReview(p: ProcessorLike, today: string): number | null {
  return p.contractSignedOn && p.contractReviewOn ? daysBetween(today, p.contractReviewOn) : null;
}

/** What a contract with a processor must cover, as a checklist for whoever drafts or reviews it. */
export const CONTRACT_TERMS = [
  "They act only on your written instructions",
  "They are bound by the same data protection obligations as you",
  "They keep the data secure and confidential, and say how",
  "They tell you about a breach without delay, and within 48 hours of becoming aware",
  "They don't pass the data to anyone else without your agreement",
  "They return or delete the data when the work ends",
] as const;

export interface ProcessorGapInput {
  contractSignedOn: string | null;
  guarantees: string;
  location: string;
  outsideKenya: boolean;
}

/**
 * What the record still needs before it shows the processor was properly
 * engaged. `activities` are the RoPA activities linked to it.
 */
export function processorGaps(p: ProcessorGapInput, activities: { name: string; crossBorder: boolean }[]): string[] {
  const gaps: string[] = [];
  if (!p.contractSignedOn) gaps.push("Sign a written contract with them. Section 42 of the Act requires one before they handle personal data for you.");
  if (!p.guarantees) gaps.push("Record how you checked that they keep the data secure.");
  if (activities.length === 0) gaps.push("Link the processing activities whose data they handle.");
  if (p.outsideKenya) {
    if (!p.location) gaps.push("Say which country they hold the data in.");
    const untransferred = activities.filter((a) => !a.crossBorder);
    if (untransferred.length > 0) {
      gaps.push(
        `They hold data outside Kenya, but your RoPA doesn't record a transfer for: ${untransferred.map((a) => a.name).join(", ")}.`,
      );
    }
  }
  return gaps;
}
