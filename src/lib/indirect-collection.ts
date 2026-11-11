// Where personal data comes from. Section 28(1) of the Data Protection Act,
// 2019 says a data controller or data processor shall collect personal data
// directly from the data subject. Section 28(2) lets it be collected
// indirectly where (a) it is in a public record; (b) the person deliberately
// made it public; (c) the person consented to its collection from another
// source; (d) the person has an incapacity and the guardian appointed
// consented; (e) collecting it from another source would not prejudice the
// person's interests; or (f) collecting it from another source is necessary
// (i) for the prevention, detection, investigation, prosecution and punishment
// of crime, (ii) for the enforcement of a law that imposes a pecuniary penalty,
// or (iii) for the protection of the interests of the person or another person.
//
// Regulation 6(1) of the Data Protection (General) Regulations, 2021 lists the
// indirect sources: any person other than the data subject, publications or
// databases, surveillance cameras where someone is identifiable, information
// associated with web browsing, and biometric technology such as voice or
// facial recognition. Regulation 6(3) says the person must be told of the
// collection within fourteen days. Regulation 9(1)(e) says an access request
// is answered with any available information as to the source.
// Plain-language summary; check against the Act and current ODPC guidance
// before relying on it.

export const INDIRECT_COLLECTION_PROVISION = "Data Protection Act, 2019, s.28; Data Protection (General) Regulations, 2021, regs. 6 and 9(1)(e)";

/** What s.28(2) accepts as allowing personal data to come from someone other than the person. */
export const INDIRECT_COLLECTION_GROUNDS = {
  public_record: "It's in a public record",
  made_public: "The person deliberately made it public",
  consent: "The person consented to it being collected from another source",
  guardian_consent: "The person has an incapacity, and their appointed guardian consented",
  no_prejudice: "Collecting it from another source doesn't prejudice the person's interests",
  crime: "Needed to prevent, detect, investigate, prosecute or punish crime",
  pecuniary_penalty: "Needed to enforce a law that imposes a financial penalty",
  protect_interests: "Needed to protect the interests of the person or someone else",
} as const;

export type IndirectCollectionGround = keyof typeof INDIRECT_COLLECTION_GROUNDS;
export const INDIRECT_COLLECTION_GROUND_KEYS = Object.keys(INDIRECT_COLLECTION_GROUNDS) as IndirectCollectionGround[];

/** The paragraph of s.28(2) each ground comes from. */
export const INDIRECT_COLLECTION_GROUND_SECTION: Record<IndirectCollectionGround, string> = {
  public_record: "s.28(2)(a)",
  made_public: "s.28(2)(b)",
  consent: "s.28(2)(c)",
  guardian_consent: "s.28(2)(d)",
  no_prejudice: "s.28(2)(e)",
  crime: "s.28(2)(f)(i)",
  pecuniary_penalty: "s.28(2)(f)(ii)",
  protect_interests: "s.28(2)(f)(iii)",
};

/** What the record should say about each ground it gives. */
export const INDIRECT_COLLECTION_GROUND_DETAIL: Record<IndirectCollectionGround, string> = {
  public_record: "Name the register or record, such as the companies register or a gazette notice, and take only what the purpose needs.",
  made_public:
    "The person must have published it themselves, on purpose, such as on their own business website. Something someone else published about them doesn't count.",
  consent: "Keep the person's agreement, such as a signed loan application that says you'll get their credit report.",
  guardian_consent:
    "For an adult who can't act for themselves, with a guardian appointed for them. Keep a record of who the guardian is and their consent.",
  no_prejudice:
    "Such as an employee giving their next of kin's phone number for emergencies. Say why the person isn't worse off for it not coming from them.",
  crime: "Such as CCTV kept to detect and investigate theft, or identity checks against fraud. Use the data only for that.",
  pecuniary_penalty: "Name the law, and use the data only to enforce it.",
  protect_interests: "Such as a referral note from another clinic about a patient's care. Say whose interests are protected and how.",
};

export interface IndirectCollectionLike {
  name: string;
  /** A processor collects on the controller's instructions, so it isn't asked for the ground. Null when nobody has said. */
  role: "controller" | "processor" | string | null;
  indirectCollection: boolean;
  /** Where the data comes from other than the person: other people, databases, cameras, browsing, biometrics. */
  indirectSources: string;
  /** What s.28(2) allows it under. Strings as they come back from the database. */
  indirectCollectionGrounds: (IndirectCollectionGround | string)[];
  /** How and when people are told their data was collected from another source (reg. 6(3)). */
  indirectCollectionNotice: string;
}

export type IndirectCollectionIssue = "no_sources" | "no_ground" | "no_notice";

/**
 * What the record still needs. None when all the data comes from the person.
 * A processor isn't asked for a ground: the controller it works for decides
 * where the data comes from. Regulation 6(3) names processors too, so a
 * processor is still asked how people are told, even if the answer is that
 * the controller tells them.
 */
export function indirectCollectionIssues(a: IndirectCollectionLike): IndirectCollectionIssue[] {
  if (!a.indirectCollection) return [];
  const issues: IndirectCollectionIssue[] = [];
  if (!a.indirectSources.trim()) issues.push("no_sources");
  if (a.role !== "processor" && a.indirectCollectionGrounds.length === 0) issues.push("no_ground");
  if (!a.indirectCollectionNotice.trim()) issues.push("no_notice");
  return issues;
}

/** What to do about an issue, as the activity's page lists it. */
export const INDIRECT_COLLECTION_GAP: Record<IndirectCollectionIssue, string> = {
  no_sources:
    "Say where the data comes from when it isn't from the person: someone else, such as a parent or an employer, a database or register, cameras, web browsing or biometric technology (reg. 6(1)). You'll need this to answer an access request (reg. 9(1)(e)).",
  no_ground:
    "Say what allows you to collect it from somewhere other than the person (s.28(2)): it's in a public record, they made it public themselves, they or their guardian consented, it doesn't prejudice their interests, or it's needed against crime, to enforce a financial penalty, or to protect someone's interests. If none applies, collect it from the person.",
  no_notice:
    "Say how people are told their data was collected from somewhere else, within 14 days (reg. 6(3)), such as a letter, an SMS, a form they sign or signs where cameras record.",
};

/** The issues as one next step on the dashboard. */
export function indirectCollectionTodo(a: Pick<IndirectCollectionLike, "name">, issues: IndirectCollectionIssue[]): string {
  return `Say ${joinAnd(issues.map((i) => TODO_PART[i]))} for the data ${a.name} gets from others`;
}

const TODO_PART: Record<IndirectCollectionIssue, string> = {
  no_sources: "where it comes from",
  no_ground: "what allows it",
  no_notice: "how people are told",
};

/** The same issues as the compliance report states them. */
export function indirectCollectionFinding(a: Pick<IndirectCollectionLike, "name">, issues: IndirectCollectionIssue[]): string {
  return `${a.name} collects data from someone other than the person it's about, and the record doesn't say ${joinAnd(issues.map((i) => FINDING_PART[i]))}.`;
}

const FINDING_PART: Record<IndirectCollectionIssue, string> = {
  no_sources: "where it comes from",
  no_ground: "what s.28(2) ground allows it",
  no_notice: "how people are told within 14 days",
};

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The activities that collect data indirectly and have something missing, with what. */
export function activitiesWithIndirectCollectionIssues<A extends IndirectCollectionLike>(
  activities: A[],
): { activity: A; issues: IndirectCollectionIssue[] }[] {
  return activities.map((activity) => ({ activity, issues: indirectCollectionIssues(activity) })).filter((x) => x.issues.length > 0);
}

/** The recorded grounds in the Act's order, as labels. Unknown values are left out. */
export function describeIndirectCollectionGrounds(grounds: readonly string[]): string[] {
  return INDIRECT_COLLECTION_GROUND_KEYS.filter((k) => grounds.includes(k)).map((k) => INDIRECT_COLLECTION_GROUNDS[k]);
}

/** Text as a sentence that the next one can follow: trimmed, with a full stop if it has no closing punctuation. */
const asSentence = (text: string) => {
  const t = text.trim();
  return !t || /[.!?)"”]$/.test(t) ? t : `${t}.`;
};

/** What a person is told about where their data comes from in the privacy notice, or null when it all comes from them. */
export function indirectCollectionNotice(a: Pick<IndirectCollectionLike, "indirectCollection" | "indirectSources">): string | null {
  if (!a.indirectCollection) return null;
  const sources = asSentence(a.indirectSources);
  return sources ? `Some of it comes from others, not from you. ${sources}` : "Some of it comes from others, not from you.";
}

/** What s.28 and reg. 6 ask when data comes from someone other than the person, as a checklist on the activity's page. */
export const INDIRECT_COLLECTION_CHECKLIST = [
  "Data is collected from the person themselves wherever that's possible (s.28(1))",
  "Each source other than the person rests on a s.28(2) ground, and the record says which",
  "People are told within 14 days that their data was collected from somewhere else (reg. 6(3)). For cameras, signs where they record tell people at the time",
  "Only the data the purpose needs is taken from the source, and it's checked to be accurate and up to date (reg. 6(2)(b))",
  "The data is used only for the purpose it was collected for, or one compatible with it; otherwise fresh consent is needed (regs. 6(4) and (5))",
  "An access request is answered with what you know about where the data came from (reg. 9(1)(e))",
  "Data collected indirectly isn't used for direct marketing, which needs data collected from the person (reg. 15(1)(a))",
] as const;
