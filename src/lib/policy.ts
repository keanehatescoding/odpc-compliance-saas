import { daysBetween } from "./dates";

// The written policies and procedures an organisation runs its data protection
// by. Section 41 of the Data Protection Act, 2019 requires appropriate
// technical and organisational measures, and reg. 23 of the Data Protection
// (General) Regulations, 2021 says a controller or processor develops,
// publishes and regularly updates a policy on how it handles personal data. A
// register of what exists, who approved it and when it is next reviewed is how
// an organisation shows the documents are real and kept up. Plain-language
// summary; check against current ODPC guidance before relying on it.

export const POLICY_KINDS = {
  data_protection: "Data protection policy",
  retention: "Retention and disposal schedule",
  breach: "Breach response plan",
  requests: "Procedure for data subject requests",
  security: "Information security policy",
  other: "Another policy or procedure",
} as const;

export type PolicyKind = keyof typeof POLICY_KINDS;
export const POLICY_KIND_KEYS = Object.keys(POLICY_KINDS) as PolicyKind[];

export interface PolicyLike {
  approvedOn: string | null;
  reviewOn: string | null;
}

export type PolicyStatus = "draft" | "review_due" | "in_place";

/** Where a policy stands. It is a draft until approved, and a review date that has arrived counts as due. */
export function policyStatus(p: PolicyLike, today: string): PolicyStatus {
  if (!p.approvedOn) return "draft";
  return p.reviewOn && p.reviewOn <= today ? "review_due" : "in_place";
}

export const POLICY_STATUS_LABEL: Record<PolicyStatus, string> = {
  draft: "Not approved",
  review_due: "Review due",
  in_place: "In place",
};

/** Days from today to the review (negative once passed), or null for a draft or when none is set. */
export function daysToPolicyReview(p: PolicyLike, today: string): number | null {
  return p.approvedOn && p.reviewOn ? daysBetween(today, p.reviewOn) : null;
}

/** The named kinds with no policy on record, in the order they are listed. */
export function missingKinds(policies: { kind: string }[]): PolicyKind[] {
  const held = new Set(policies.map((p) => p.kind));
  return POLICY_KIND_KEYS.filter((k) => k !== "other" && !held.has(k));
}

/** What a data protection policy usually covers, as a checklist for whoever writes or reviews one. */
export const POLICY_CONTENTS = [
  "What personal data you collect and hold, and the lawful purposes you use it for",
  "How people can see their data and use their other rights, and who to ask",
  "How you handle complaints",
  "When personal data leaves Kenya, and the safeguards for it",
  "How long you keep personal data, and how it is disposed of",
  "How you collect and protect children's data, if you hold any",
  "Who is responsible for data protection, and what staff must do",
] as const;

export interface PolicyGapInput {
  approvedOn: string | null;
  approvedBy: string;
  reviewOn: string | null;
  owner: string;
  location: string;
  communicated: string;
}

/** What the record still needs before it shows the policy is in force. */
export function policyGaps(p: PolicyGapInput): string[] {
  const gaps: string[] = [];
  if (!p.approvedOn) gaps.push("Have it approved, and record the date. Until then it is a draft.");
  if (!p.approvedBy) gaps.push("Say who approved it, such as the board or the head of the organisation.");
  if (!p.owner) gaps.push("Say who is responsible for keeping it up to date.");
  if (!p.location) gaps.push("Say where the document is kept, so it can be produced when asked for.");
  if (!p.communicated) gaps.push("Record how staff were told about it. A policy nobody has read protects no one.");
  if (p.approvedOn && !p.reviewOn) gaps.push("Set a date to review it.");
  return gaps;
}
