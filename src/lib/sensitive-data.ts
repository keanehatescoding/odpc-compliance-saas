// Sensitive personal data: race, health status, ethnic social origin,
// conscience, belief, genetic and biometric data, property details, marital
// status, family details, and sex or sexual orientation (s.2 of the Data
// Protection Act, 2019). Part V of the Act sets the rules for it.
//
// Section 44 allows none of it to be processed unless the principles of s.25
// apply. Section 45 then lists when it may be processed: (a) by a foundation,
// association or other not-for-profit body with a political, philosophical,
// religious or trade union aim, with appropriate safeguards, about its members
// or people in regular contact with it, and not disclosed outside it without
// the person's consent; (b) where the person has manifestly made it public; or
// (c) where it is necessary for (i) a legal claim, (ii) carrying out the
// obligations and exercising the specific rights of the controller or the
// person, or (iii) the vital interests of the person or someone else when the
// person is physically or legally incapable of giving consent. The list has
// no consent ground of its own.
//
// Section 46 adds that data about a person's health may only be processed by
// or under the responsibility of a health care provider, or by someone bound
// by professional secrecy under a law (s.46(1)), a condition met where the
// processing is necessary for the public interest in public health, or is done
// by someone who owes a duty of confidentiality under a law (s.46(2)).
// Regulation 32(i) of the Data Protection (General) Regulations, 2021 asks for
// sensitive personal data to be protected with adequate measures and, where
// possible, kept separate from the rest.
// Plain-language summary; check against the Act and current ODPC guidance
// before relying on it.

import type { SENSITIVE_CATEGORIES } from "./dpa";

export const SENSITIVE_DATA_PROVISION = "Data Protection Act, 2019, ss.44–46; Data Protection (General) Regulations, 2021, reg. 32(i)";

/** The category of sensitive personal data that s.46 sets further conditions for. */
export const HEALTH_CATEGORY = "Health status" satisfies (typeof SENSITIVE_CATEGORIES)[number];

/** What s.45 accepts as allowing sensitive personal data to be processed. */
export const SENSITIVE_DATA_GROUNDS = {
  obligations: "Needed to carry out your obligations, or exercise your or the person's specific rights",
  legal_claim: "Needed to establish, exercise or defend a legal claim",
  vital_interests: "Needed to protect someone's vital interests when the person can't consent",
  made_public: "The person has manifestly made it public themselves",
  not_for_profit: "A not-for-profit body with a political, philosophical, religious or trade union aim, about its members",
} as const;

export type SensitiveDataGround = keyof typeof SENSITIVE_DATA_GROUNDS;
export const SENSITIVE_DATA_GROUND_KEYS = Object.keys(SENSITIVE_DATA_GROUNDS) as SensitiveDataGround[];

/** The paragraph of s.45 each ground comes from. */
export const SENSITIVE_DATA_GROUND_SECTION: Record<SensitiveDataGround, string> = {
  obligations: "s.45(c)(ii)",
  legal_claim: "s.45(c)(i)",
  vital_interests: "s.45(c)(iii)",
  made_public: "s.45(b)",
  not_for_profit: "s.45(a)",
};

/** What the record should say about the ground it gives. */
export const SENSITIVE_DATA_GROUND_DETAIL: Record<SensitiveDataGround, string> = {
  obligations:
    "Name the law that sets the obligation or gives the right, such as the Employment Act for sick leave or the Health Act for patient records, and use only the sensitive data it needs.",
  legal_claim: "Name the claim, or the kind of claim, and keep only the sensitive data it needs for as long as it runs.",
  vital_interests:
    "This is for emergencies: the person must be physically or legally unable to consent, such as when unconscious. Say when that happens, and fall back on another ground for the rest of the time.",
  made_public:
    "The person must have made it public themselves, plainly and on purpose, such as their own public post. Something published by someone else doesn't count. Say where it was made public.",
  not_for_profit:
    "Only for a foundation, association or other not-for-profit body with a political, philosophical, religious or trade union aim. The data must be about its members or people in regular contact with it for its purposes, and must not leave the body without the person's consent.",
};

/** The conditions s.46 sets for data about a person's health. */
export const HEALTH_DATA_CONDITIONS = {
  health_care_provider: "By or under the responsibility of a health care provider",
  professional_secrecy: "By someone bound by professional secrecy under a law",
  confidentiality: "By someone who owes a duty of confidentiality under a law",
  public_health: "Needed for reasons of public interest in public health",
} as const;

export type HealthDataCondition = keyof typeof HEALTH_DATA_CONDITIONS;
export const HEALTH_DATA_CONDITION_KEYS = Object.keys(HEALTH_DATA_CONDITIONS) as HealthDataCondition[];

/** The paragraph of s.46 each condition comes from. */
export const HEALTH_DATA_CONDITION_SECTION: Record<HealthDataCondition, string> = {
  health_care_provider: "s.46(1)(a)",
  professional_secrecy: "s.46(1)(b)",
  confidentiality: "s.46(2)(b)",
  public_health: "s.46(2)(a)",
};

export interface SensitiveDataLike {
  name: string;
  /** A processor acts on the controller's ground, so it isn't asked for one. Null when nobody has said. */
  role: "controller" | "processor" | string | null;
  sensitiveCategories: string[];
  /** Null until someone says which ground applies. A string as it comes back from the database. */
  sensitiveDataGround: SensitiveDataGround | string | null;
  /** What the ground rests on: the law, the claim, where it was made public. */
  sensitiveDataBasis: string;
  /** Null until someone says, and always null unless the activity involves health data. */
  healthDataCondition: HealthDataCondition | string | null;
  /** How the sensitive data is protected and kept apart from the rest (reg. 32(i)). */
  sensitiveDataSafeguards: string;
}

export type SensitiveDataIssue = "no_ground" | "no_basis" | "no_health_condition" | "no_safeguards";

/** Whether the activity involves data about people's health, which s.46 sets further conditions for. */
export function involvesHealthData(a: Pick<SensitiveDataLike, "sensitiveCategories">): boolean {
  return a.sensitiveCategories.includes(HEALTH_CATEGORY);
}

/**
 * What the record still needs. None when the activity involves no sensitive
 * personal data. A processor isn't asked for a ground: the controller it works
 * for answers for that. Section 46 limits who may handle health data whoever
 * they work for, so a processor is still asked for the health condition.
 */
export function sensitiveDataIssues(a: SensitiveDataLike): SensitiveDataIssue[] {
  if (a.sensitiveCategories.length === 0) return [];
  const issues: SensitiveDataIssue[] = [];
  if (a.role !== "processor") {
    if (!a.sensitiveDataGround) issues.push("no_ground");
    else if (!a.sensitiveDataBasis.trim()) issues.push("no_basis");
  }
  if (involvesHealthData(a) && !a.healthDataCondition) issues.push("no_health_condition");
  if (!a.sensitiveDataSafeguards.trim()) issues.push("no_safeguards");
  return issues;
}

/** What to do about an issue, as the activity's page lists it. */
export const SENSITIVE_DATA_GAP: Record<SensitiveDataIssue, string> = {
  no_ground:
    "Say what allows you to process the sensitive data (s.45): it's needed for your obligations or rights or the person's, for a legal claim, or for someone's vital interests when the person can't consent, the person made it public themselves, or you're a not-for-profit body processing your members' data. If none applies, stop collecting it.",
  no_basis: "Say what the ground rests on: the law that sets the obligation, the claim, or where the person made the data public.",
  no_health_condition:
    "Say who handles the health data (s.46): a health care provider or someone working under one, someone bound by professional secrecy or a duty of confidentiality under a law, or that it's needed for public health.",
  no_safeguards:
    "Say how the sensitive data is protected beyond the rest, and whether it's kept apart from it, such as a separate file or system only named people can open (reg. 32(i)).",
};

/** The issues as one next step on the dashboard. */
export function sensitiveDataTodo(a: Pick<SensitiveDataLike, "name">, issues: SensitiveDataIssue[]): string {
  return `Say ${joinAnd(issues.map((i) => TODO_PART[i]))} for the sensitive data in ${a.name}`;
}

const TODO_PART: Record<SensitiveDataIssue, string> = {
  no_ground: "what allows it",
  no_basis: "what the ground rests on",
  no_health_condition: "who handles the health data",
  no_safeguards: "how it's protected",
};

/** The same issues as the compliance report states them. */
export function sensitiveDataFinding(a: Pick<SensitiveDataLike, "name">, issues: SensitiveDataIssue[]): string {
  return `${a.name} involves sensitive personal data, and the record doesn't say ${joinAnd(issues.map((i) => FINDING_PART[i]))}.`;
}

const FINDING_PART: Record<SensitiveDataIssue, string> = {
  no_ground: "what s.45 ground allows it",
  no_basis: "what the s.45 ground rests on",
  no_health_condition: "which s.46 condition the health data is handled under",
  no_safeguards: "how it's protected or kept apart",
};

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The activities involving sensitive personal data that have something missing, with what. */
export function activitiesWithSensitiveDataIssues<A extends SensitiveDataLike>(activities: A[]): { activity: A; issues: SensitiveDataIssue[] }[] {
  return activities.map((activity) => ({ activity, issues: sensitiveDataIssues(activity) })).filter((x) => x.issues.length > 0);
}

/** The ground as the record states it, with the paragraph it comes from. */
export function describeSensitiveDataGround(ground: SensitiveDataGround | string | null): string | null {
  if (!ground || !(ground in SENSITIVE_DATA_GROUNDS)) return null;
  const g = ground as SensitiveDataGround;
  return `${SENSITIVE_DATA_GROUNDS[g]} (${SENSITIVE_DATA_GROUND_SECTION[g]})`;
}

/** The health condition as the record states it, with the paragraph it comes from. */
export function describeHealthDataCondition(condition: HealthDataCondition | string | null): string | null {
  if (!condition || !(condition in HEALTH_DATA_CONDITIONS)) return null;
  const c = condition as HealthDataCondition;
  return `${HEALTH_DATA_CONDITIONS[c]} (${HEALTH_DATA_CONDITION_SECTION[c]})`;
}

/** What ss.44–46 and reg. 32(i) ask of sensitive personal data, as a checklist on the activity's page. */
export const SENSITIVE_DATA_CHECKLIST = [
  "You collect only the sensitive data the purpose needs, and the principles of s.25 apply to it as to any personal data (s.44)",
  "One of the s.45 grounds applies. The Act lists no consent ground for sensitive data, so consent alone may not be enough: check with counsel if you rely on it",
  "Health data is handled by or under a health care provider, or by people bound by professional secrecy or a duty of confidentiality under a law, unless it's needed for public health (s.46)",
  "The sensitive data is protected with adequate measures and, where possible, kept apart from the rest, such as a separate file or system only named people can open (reg. 32(i))",
  "A DPIA has been considered: processing sensitive data is high risk (reg. 49(1)(e))",
  "None of it is used for direct marketing (reg. 15(1)), and it leaves Kenya only with the person's consent and safeguards (s.49)",
] as const;
