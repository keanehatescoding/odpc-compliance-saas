// Children's personal data. Section 33(1) of the Data Protection Act, 2019 says
// a data controller or data processor shall not process personal data relating
// to a child unless (a) consent is given by the child's parent or guardian; and
// (b) the processing is in a manner that protects and advances the rights and
// best interests of the child. Section 33(2) asks for appropriate mechanisms for
// age verification and consent, and s.33(3) says they are determined by the
// available technology, the volume of data, the proportion likely to be a
// child's, the possibility of harm and anything else the Data Commissioner
// specifies. Section 33(4) says one that exclusively provides counselling or
// child protection services to a child may not be required to obtain parental
// consent.
//
// Regulation 13(2) of the Data Protection (General) Regulations, 2021 adds that
// where the data subject is a child, (a) a person exercising the child's rights
// is appropriately identified; (b) profiling of a child related to direct
// marketing is prohibited; and (c) the parent or guardian is informed of the
// inherent risks in processing and the safeguards put in place. Regulation
// 49(1)(e) counts processing data relating to children as likely high risk.
// Plain-language summary; check against the Act and current ODPC guidance
// before relying on it.

export const CHILDREN_DATA_PROVISION = "Data Protection Act, 2019, s.33; Data Protection (General) Regulations, 2021, regs. 13(2) and 49(1)(e)";

export interface ChildrenDataLike {
  name: string;
  /** A processor acts on the controller's instructions, so it isn't asked how consent is got. Null when nobody has said. */
  role: "controller" | "processor" | string | null;
  involvesChildren: boolean;
  /** How the organisation tells a child's data from an adult's, such as a date of birth checked against a birth certificate (s.33(2)). */
  childAgeCheck: string;
  /** The activity only provides counselling or child protection services to children, so parental consent may not be needed (s.33(4)). */
  childCounselling: boolean;
  /** How a parent or guardian gives consent, and how the organisation checks who they are (s.33(1)(a); reg. 13(2)(a)). */
  parentalConsent: string;
  /** How the processing protects the child's best interests, and how parents are told the risks and safeguards (s.33(1)(b); reg. 13(2)(c)). */
  childSafeguards: string;
}

export type ChildrenDataIssue = "no_age_check" | "no_parental_consent" | "no_safeguards";

/** Whether the record must say how a parent's or guardian's consent is got: not for a processor, or under s.33(4). */
export function needsParentalConsent(a: Pick<ChildrenDataLike, "role" | "involvesChildren" | "childCounselling">): boolean {
  return a.involvesChildren && a.role !== "processor" && !a.childCounselling;
}

/**
 * What the record still needs. None when the activity doesn't involve children.
 * Section 33 names processors too, so a processor is still asked how it tells a
 * child's data apart and how it protects it; getting the parent's consent is the
 * controller's to do. An activity under s.33(4) isn't asked for consent either.
 */
export function childrenDataIssues(a: ChildrenDataLike): ChildrenDataIssue[] {
  if (!a.involvesChildren) return [];
  const issues: ChildrenDataIssue[] = [];
  if (!a.childAgeCheck.trim()) issues.push("no_age_check");
  if (needsParentalConsent(a) && !a.parentalConsent.trim()) issues.push("no_parental_consent");
  if (!a.childSafeguards.trim()) issues.push("no_safeguards");
  return issues;
}

/** What to do about an issue, as the activity's page lists it. */
export const CHILDREN_DATA_GAP: Record<ChildrenDataIssue, string> = {
  no_age_check:
    "Say how you know which data is a child's, such as a date of birth on the form checked against a birth certificate, or an age question before an account is opened (s.33(2)). The check should match the risk: how much data, how much of it is children's and the harm that could follow (s.33(3)).",
  no_parental_consent:
    "Say how a parent or guardian gives consent, and how you check that the person agreeing is the child's parent or guardian (s.33(1)(a); reg. 13(2)(a)). If you only provide counselling or child protection services to the children, tick that instead (s.33(4)).",
  no_safeguards:
    "Say how the processing protects the child's best interests, such as who can see the data and what it's never used for, and how parents or guardians are told the risks and the safeguards (s.33(1)(b); reg. 13(2)(c)). The privacy notice shows this.",
};

/** The issues as one next step on the dashboard. */
export function childrenDataTodo(a: Pick<ChildrenDataLike, "name">, issues: ChildrenDataIssue[]): string {
  return `Say ${joinAnd(issues.map((i) => TODO_PART[i]))} for the children's data in ${a.name}`;
}

const TODO_PART: Record<ChildrenDataIssue, string> = {
  no_age_check: "how you check age",
  no_parental_consent: "how a parent consents",
  no_safeguards: "how children are protected",
};

/** The same issues as the compliance report states them. */
export function childrenDataFinding(a: Pick<ChildrenDataLike, "name">, issues: ChildrenDataIssue[]): string {
  return `${a.name} involves children's data, and the record doesn't say ${joinAnd(issues.map((i) => FINDING_PART[i]))}.`;
}

const FINDING_PART: Record<ChildrenDataIssue, string> = {
  no_age_check: "how a child's data is told apart (s.33(2))",
  no_parental_consent: "how a parent or guardian consents (s.33(1)(a))",
  no_safeguards: "how the processing protects the child (s.33(1)(b))",
};

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The activities that involve children and have something missing, with what. */
export function activitiesWithChildrenDataIssues<A extends ChildrenDataLike>(activities: A[]): { activity: A; issues: ChildrenDataIssue[] }[] {
  return activities.map((activity) => ({ activity, issues: childrenDataIssues(activity) })).filter((x) => x.issues.length > 0);
}

/** How a parent's consent is recorded, as the RoPA export and the report show it. */
export function describeParentalConsent(a: Pick<ChildrenDataLike, "role" | "involvesChildren" | "childCounselling" | "parentalConsent">): string {
  if (!a.involvesChildren) return "";
  if (a.parentalConsent.trim()) return a.parentalConsent.trim();
  if (a.childCounselling) return "Not needed: counselling or child protection services only (s.33(4))";
  if (a.role === "processor") return "For the controller to get";
  return "Not recorded";
}

/** What s.33 and reg. 13(2) ask when an activity involves children, as a checklist on the activity's page. */
export const CHILDREN_DATA_CHECKLIST = [
  "A parent or guardian consents before a child's data is processed, unless you only provide counselling or child protection services to the child (ss.33(1)(a) and (4))",
  "You can tell which data is a child's, with an age check that fits how much data there is, how much of it is children's and the harm that could follow (ss.33(2) and (3))",
  "You check that the person consenting, or exercising the child's rights, is the child's parent or guardian (reg. 13(2)(a))",
  "The processing protects and advances the child's rights and best interests (s.33(1)(b))",
  "Children aren't profiled for direct marketing (reg. 13(2)(b))",
  "Parents and guardians are told the risks of the processing and the safeguards in place (reg. 13(2)(c))",
  "A DPIA is considered, since children's data counts as likely high risk (reg. 49(1)(e))",
] as const;
