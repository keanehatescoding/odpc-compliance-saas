import { daysBetween } from "./dates";
import { LAWFUL_BASES, type LawfulBasis } from "./dpa";

// A legitimate interest assessment: why the organisation's interest in an
// activity justifies it without asking for consent. Section 30(1)(b)(vii) of
// the Data Protection Act, 2019 allows processing that is necessary for the
// legitimate interests of the controller, the processor or a third party the
// data is disclosed to, unless it is unwarranted having regard to the harm
// and prejudice to the data subject's rights, freedoms or legitimate
// interests. Section 36 lets people object unless the organisation shows a
// compelling interest that overrides theirs. The Act doesn't ask for a
// written assessment; the three questions here (the interest, whether the
// processing is necessary for it, and the balance) are the usual way to show
// the basis holds. Plain-language summary; check against current ODPC
// guidance before relying on it.

export const LIA_OUTCOMES = {
  pending: "Not decided yet",
  justified: "The interest justifies the processing",
  overridden: "People's rights outweigh the interest",
} as const;

export type LiaOutcome = keyof typeof LIA_OUTCOMES;
export const LIA_OUTCOME_KEYS = Object.keys(LIA_OUTCOMES) as LiaOutcome[];

export interface LiaLike {
  interest: string;
  necessity: string;
  impact: string;
  outcome: string;
  reviewOn: string | null;
}

export type LiaStatus = "incomplete" | "not_justified" | "review_due" | "in_place";

/**
 * Whether the assessment supports relying on legitimate interests. One that
 * decided against the processing says so whatever else is filled in. Otherwise
 * it needs all three answers and a decision, and a review date that has
 * arrived counts as due.
 */
export function liaStatus(l: LiaLike, today: string): LiaStatus {
  if (l.outcome === "overridden") return "not_justified";
  if (!l.interest || !l.necessity || !l.impact || l.outcome !== "justified") return "incomplete";
  return l.reviewOn && l.reviewOn <= today ? "review_due" : "in_place";
}

export const LIA_STATUS_LABEL: Record<LiaStatus, string> = {
  incomplete: "Not finished",
  not_justified: "Not justified",
  review_due: "Review due",
  in_place: "In place",
};

/** Days from today to the review (negative once passed), or null when none is set. */
export function daysToLiaReview(l: LiaLike, today: string): number | null {
  return l.reviewOn ? daysBetween(today, l.reviewOn) : null;
}

/** The three questions an assessment answers, as a checklist for whoever writes or reviews one. */
export const LIA_TEST = [
  "The interest: it is real, lawful and specific. “Preventing theft from the shop” is an interest; “business purposes” is not",
  "Necessity: the processing actually serves the interest, and nothing less intrusive would do the job",
  "The balance: people would expect it, given how they deal with you and what you told them",
  "The balance: it does them no harm that outweighs your interest. Weigh children's data, sensitive data and anything hard to undo more heavily",
  "Safeguards: less data, shorter retention, fewer people with access or an easy opt-out can tip the balance",
  "People can object, and you know what you'll do when they do",
  "If the balance goes against you, stop, change the processing or rely on another lawful basis. Don't rewrite the assessment",
] as const;

export interface LiaGapInput {
  interest: string;
  necessity: string;
  impact: string;
  safeguards: string;
  objection: string;
  outcome: string;
  decidedBy: string;
  decidedOn: string | null;
}

export interface LiaActivity {
  name: string;
  lawfulBasis: string;
  involvesChildren: boolean;
}

/**
 * What the assessment still needs before it shows the basis holds.
 * `activity` is the RoPA activity it is for, or null when there is none.
 */
export function liaGaps(l: LiaGapInput, activity: LiaActivity | null): string[] {
  const gaps: string[] = [];
  if (!l.interest) gaps.push("Say what the interest is and whose it is: yours, or a third party's you share the data with.");
  if (!l.necessity) gaps.push("Say why the processing is necessary for that interest, and what less intrusive ways you considered.");
  if (!l.impact) gaps.push("Say what it means for the people concerned: whether they would expect it and what harm it could do them.");
  if (l.outcome === "pending") {
    gaps.push("Record the decision: whether the interest justifies the processing once weighed against people's rights.");
  } else if (!l.decidedBy || !l.decidedOn) {
    gaps.push("Record who made the decision and when.");
  }
  if (!l.objection) {
    gaps.push("Say how people can object and what you do when they do. Section 36 of the Act gives them the right.");
  }
  if (!activity) {
    gaps.push("Link the processing activity this assessment is for.");
  } else {
    if (stillReliedOn(l, activity)) {
      gaps.push(
        `This assessment found against the processing, but your RoPA still relies on legitimate interests for ${activity.name}. Stop or change the processing, or record another lawful basis.`,
      );
    }
    // Once an assessment has gone against the processing, another basis in the RoPA is the fix, not a mismatch.
    if (activity.lawfulBasis !== "legitimate_interests" && l.outcome !== "overridden") {
      gaps.push(
        `Your RoPA gives “${LAWFUL_BASES[activity.lawfulBasis as LawfulBasis] ?? activity.lawfulBasis}” as the lawful basis for ${activity.name}, not legitimate interests. Update whichever is wrong.`,
      );
    }
    if (activity.involvesChildren && !l.safeguards) {
      gaps.push(
        `${activity.name} involves children's data. Record the safeguards that protect them: section 33 of the Act expects processing that protects and advances a child's best interests.`,
      );
    }
  }
  return gaps;
}

/**
 * Whether an assessment that went against the processing is still being
 * ignored: its activity carries on under legitimate interests all the same.
 */
export function stillReliedOn(
  l: { outcome: string },
  activity: { lawfulBasis: string; role?: string | null } | null | undefined,
): boolean {
  return l.outcome === "overridden" && !!activity && reliesOnLegitimateInterests(activity);
}

/** Whether the assessment falls to the organisation: not when it only processes for someone else. */
export function reliesOnLegitimateInterests(a: { lawfulBasis: string; role?: string | null }): boolean {
  return a.lawfulBasis === "legitimate_interests" && a.role !== "processor";
}

/** The activities that rely on legitimate interests but have no assessment behind them. */
export function activitiesWithoutAssessment<A extends { id: string; lawfulBasis: string; role?: string | null }>(
  activities: A[],
  assessments: { activityId: string | null }[],
): A[] {
  const covered = new Set(assessments.map((l) => l.activityId));
  return activities.filter((a) => reliesOnLegitimateInterests(a) && !covered.has(a.id));
}
