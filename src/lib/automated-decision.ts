// Decisions about people taken by automated means alone. Section 35(1) of the
// Data Protection Act, 2019 gives everyone the right not to be subject to a
// decision "based solely on automated processing, including profiling, which
// produces legal effects concerning or significantly affects" them, unless the
// decision is necessary for a contract with them, authorised by a law that
// safeguards their rights, or based on their consent (s.35(2)). Whoever takes
// such a decision must tell the person in writing as soon as reasonably
// practicable, and the person may ask for it to be reconsidered or taken again
// by a human (s.35(3)), which must be considered, done and answered in writing
// within a reasonable time (s.35(4)).
//
// Regulation 22(2) of the Data Protection (General) Regulations, 2021 adds that
// the person is told and given meaningful information about the logic involved
// and what the decision means for them, that errors and bias are guarded
// against, and that they can obtain human intervention and give their view.
// Regulation 49(1)(a) lists such decisions among the processing that needs a
// DPIA, and reg. 4(1)(d) says people asked for consent are told about them.
// Plain-language summary; check against the Act and current ODPC guidance
// before relying on it.

export const AUTOMATED_DECISION_PROVISION = "Data Protection Act, 2019, s.35; Data Protection (General) Regulations, 2021, reg. 22";

/** What s.35(2) accepts as allowing a decision to be taken by automated means alone. */
export const AUTOMATED_DECISION_GROUNDS = {
  contract: "Necessary to enter into or carry out a contract with the person",
  law: "Authorised by a law that safeguards the person's rights",
  consent: "The person's consent",
} as const;

export type AutomatedDecisionGround = keyof typeof AUTOMATED_DECISION_GROUNDS;
export const AUTOMATED_DECISION_GROUND_KEYS = Object.keys(AUTOMATED_DECISION_GROUNDS) as AutomatedDecisionGround[];

/** What the record should say about the ground it gives. */
export const AUTOMATED_DECISION_GROUND_DETAIL: Record<AutomatedDecisionGround, string> = {
  contract: "The decision has to be needed for the contract, such as approving a loan the person applied for, not merely convenient.",
  law: "The law has to authorise the decision and lay down how the person's rights are protected. Name it when you describe the decision.",
  consent: "When you ask for consent, tell people the decision is automated (reg. 4(1)(d) of the General Regulations), and record it as a consent record.",
};

export interface AutomatedDecisionLike {
  name: string;
  automatedDecisions: boolean;
  /** Null until someone says which ground applies. A string as it comes back from the database. */
  automatedDecisionGround: AutomatedDecisionGround | string | null;
  /** What is decided, the logic involved and what it means for the person. */
  automatedDecisionLogic: string;
  /** How the person is told, and how they ask for the decision to be reconsidered or taken by a person. */
  automatedDecisionReview: string;
  /** How errors and bias are checked for. */
  automatedDecisionChecks: string;
}

export type AutomatedDecisionIssue = "no_ground" | "no_logic" | "no_review" | "no_checks";

/** What the record still needs. None when the activity takes no decisions by automated means alone. */
export function automatedDecisionIssues(a: AutomatedDecisionLike): AutomatedDecisionIssue[] {
  if (!a.automatedDecisions) return [];
  const issues: AutomatedDecisionIssue[] = [];
  if (!a.automatedDecisionGround) issues.push("no_ground");
  if (!a.automatedDecisionLogic.trim()) issues.push("no_logic");
  if (!a.automatedDecisionReview.trim()) issues.push("no_review");
  if (!a.automatedDecisionChecks.trim()) issues.push("no_checks");
  return issues;
}

/** What to do about an issue, as the activity's page lists it. */
export const AUTOMATED_DECISION_GAP: Record<AutomatedDecisionIssue, string> = {
  no_ground:
    "Say what allows the decision to be taken without a person (s.35(2)): it is needed for a contract with the person, a law authorises it, or they consented. If none applies, a person has to take the decision.",
  no_logic: "Describe what is decided, the logic involved and what the decision means for the person (reg. 22(2)(b) and (d)).",
  no_review:
    "Say how people are told in writing that the decision was automated, and how they ask for it to be reconsidered or taken again by a person (s.35(3)).",
  no_checks: "Say how you check the decisions for errors and bias, and correct them (reg. 22(2)(e) to (h)).",
};

/** The issues as one next step on the dashboard. */
export function automatedDecisionTodo(a: Pick<AutomatedDecisionLike, "name">, issues: AutomatedDecisionIssue[]): string {
  const parts = issues.map((i) => TODO_PART[i]);
  return `Say ${joinAnd(parts)} for the automated decisions in ${a.name}`;
}

const TODO_PART: Record<AutomatedDecisionIssue, string> = {
  no_ground: "what allows them",
  no_logic: "how they're made",
  no_review: "how people ask for a person to look again",
  no_checks: "how errors and bias are checked",
};

/** The same issues as the compliance report states them. */
export function automatedDecisionFinding(a: Pick<AutomatedDecisionLike, "name">, issues: AutomatedDecisionIssue[]): string {
  return `${a.name} takes decisions by automated means alone, and the record doesn't say ${joinAnd(issues.map((i) => FINDING_PART[i]))}.`;
}

const FINDING_PART: Record<AutomatedDecisionIssue, string> = {
  no_ground: "what s.35(2) ground allows them",
  no_logic: "what is decided or the logic involved",
  no_review: "how people are told or how they ask for a person to reconsider",
  no_checks: "how errors and bias are checked for",
};

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The activities that take automated decisions and have something missing, with what. */
export function activitiesWithAutomatedDecisionIssues<A extends AutomatedDecisionLike>(activities: A[]): { activity: A; issues: AutomatedDecisionIssue[] }[] {
  return activities.map((activity) => ({ activity, issues: automatedDecisionIssues(activity) })).filter((x) => x.issues.length > 0);
}

/** Text as a sentence that the next one can follow: trimmed, with a full stop if it has no closing punctuation. */
const asSentence = (text: string) => {
  const t = text.trim();
  return !t || /[.!?)"”]$/.test(t) ? t : `${t}.`;
};

/** What a person is told about an activity's automated decisions in the privacy notice, or null when it takes none. */
export function automatedDecisionNotice(a: AutomatedDecisionLike): string | null {
  if (!a.automatedDecisions) return null;
  const logic = asSentence(a.automatedDecisionLogic);
  const review = asSentence(a.automatedDecisionReview);
  return [
    logic || "Some decisions about you are made by automated means, without a person involved.",
    "We'll tell you in writing when a decision has been made this way, and you can ask us to reconsider it or to have a person take it again.",
    review,
  ]
    .filter(Boolean)
    .join(" ");
}

/** What s.35 and reg. 22 ask of an automated decision, as a checklist on the activity's page. */
export const AUTOMATED_DECISION_CHECKLIST = [
  "The decision is needed for a contract with the person, authorised by a law that safeguards their rights, or made with their consent (s.35(2))",
  "People are told, before and when it happens, that the decision is automated, with meaningful information about the logic and what it means for them (s.35(3)(a); reg. 22(2)(a), (b) and (d))",
  "Someone can ask for the decision to be reconsidered, or taken again by a person, and give their view. The request is considered, acted on and answered in writing (s.35(3)(b) and (4); reg. 22(2)(i))",
  "The method is statistically sound, and results are checked for errors and for discrimination or bias, which are corrected (reg. 22(2)(e) to (h))",
  "People can object to profiling, in particular profiling for marketing (reg. 22(2)(c)(ii))",
  "A DPIA has been done before the processing starts (reg. 49(1)(a))",
] as const;
