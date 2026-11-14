// Personal data that has to be kept in Kenya. Section 50 of the Data Protection
// Act, 2019 lets the Cabinet Secretary prescribe, on grounds of strategic
// interests of the state or protection of revenue, processing that shall only
// be done through a server or data centre located in Kenya.
//
// Regulation 26(1) of the Data Protection (General) Regulations, 2021 says a
// data controller or data processor that processes personal data for one of
// the purposes in reg. 26(2) shall (a) process it through a server and data
// centre located in Kenya; or (b) store at least one serving copy of it in a
// data centre located in Kenya. The purposes are (a) administering civil
// registration and legal identity management systems; (b) facilitating
// elections; (c) overseeing any system for administering public finances by a
// state organ; (d) running a system designated a protected computer system
// under s.20 of the Computer Misuse and Cybercrimes Act, 2018; (e) offering any
// form of early childhood education and basic education under the Basic
// Education Act, 2013; and (f) providing primary or secondary health care for
// a data subject in the country. Regulation 26(3) lets the Cabinet Secretary
// require the same of a controller that processes data outside Kenya and
// doesn't deal with a breach or cooperate with the Data Commissioner.
// Plain-language summary; check against the Act and current ODPC guidance
// before relying on it.

export const DATA_LOCALISATION_PROVISION = "Data Protection Act, 2019, s.50; Data Protection (General) Regulations, 2021, reg. 26";

/** The purposes in reg. 26(2) for which personal data has to be kept in Kenya. */
export const KENYA_DATA_PURPOSES = {
  civil_registration: "Civil registration or legal identity management",
  elections: "Conducting elections",
  public_finance: "A system for administering public finances by a state organ",
  protected_system: "A protected computer system (Computer Misuse and Cybercrimes Act, 2018, s.20)",
  basic_education: "Early childhood or basic education (Basic Education Act, 2013)",
  health_care: "Primary or secondary health care",
} as const;

export type KenyaDataPurpose = keyof typeof KENYA_DATA_PURPOSES;
export const KENYA_DATA_PURPOSE_KEYS = Object.keys(KENYA_DATA_PURPOSES) as KenyaDataPurpose[];

/** The paragraph of reg. 26(2) each purpose comes from. */
export const KENYA_DATA_PURPOSE_SECTION: Record<KenyaDataPurpose, string> = {
  civil_registration: "reg. 26(2)(a)",
  elections: "reg. 26(2)(b)",
  public_finance: "reg. 26(2)(c)",
  protected_system: "reg. 26(2)(d)",
  basic_education: "reg. 26(2)(e)",
  health_care: "reg. 26(2)(f)",
};

/** The two ways reg. 26(1) allows the data to be kept in Kenya. */
export const KENYA_HOSTING = {
  in_kenya: "Processed through a server and data centre in Kenya",
  serving_copy: "At least one serving copy kept in a data centre in Kenya",
} as const;

export type KenyaHosting = keyof typeof KENYA_HOSTING;
export const KENYA_HOSTING_KEYS = Object.keys(KENYA_HOSTING) as KenyaHosting[];

export const KENYA_HOSTING_SECTION: Record<KenyaHosting, string> = {
  in_kenya: "reg. 26(1)(a)",
  serving_copy: "reg. 26(1)(b)",
};

export interface DataLocalisationLike {
  name: string;
  /** The reg. 26(2) purpose the activity serves. Null when none does. Strings as they come back from the database. */
  kenyaDataPurpose: KenyaDataPurpose | string | null;
  /** Which of reg. 26(1)(a) and (b) the activity relies on. Null until someone says. */
  kenyaHosting: KenyaHosting | string | null;
  /** The data centre in Kenya, such as the provider and town or the school's own server room, and for a serving copy how it's kept current. */
  kenyaDataCentre: string;
}

/** A processor the activity's data goes to, as the processor register records it. */
export interface LocalisationProcessor {
  name: string;
  outsideKenya: boolean;
}

export type DataLocalisationIssue = "no_hosting" | "no_data_centre" | "processed_abroad";

/** Whether reg. 26 asks for the activity's data to be kept in Kenya. */
export function needsKenyaHosting(a: Pick<DataLocalisationLike, "kenyaDataPurpose">): boolean {
  return a.kenyaDataPurpose !== null;
}

/**
 * What the record still needs. None when no reg. 26(2) purpose applies.
 * Regulation 26 names processors too, so a processor is asked the same.
 * `processors` are the processors linked to the activity: one that holds the
 * data outside Kenya contradicts processing it only in Kenya, though it's
 * fine alongside a serving copy kept here.
 */
export function dataLocalisationIssues(a: DataLocalisationLike, processors: LocalisationProcessor[] = []): DataLocalisationIssue[] {
  if (!needsKenyaHosting(a)) return [];
  const issues: DataLocalisationIssue[] = [];
  if (!a.kenyaHosting) issues.push("no_hosting");
  if (!a.kenyaDataCentre.trim()) issues.push("no_data_centre");
  if (a.kenyaHosting === "in_kenya" && offshoreProcessors(processors).length > 0) issues.push("processed_abroad");
  return issues;
}

/** The processors that hold the data outside Kenya. */
export function offshoreProcessors<P extends LocalisationProcessor>(processors: P[]): P[] {
  return processors.filter((p) => p.outsideKenya);
}

/** What to do about an issue, as the activity's page lists it. */
export const DATA_LOCALISATION_GAP: Record<DataLocalisationIssue, string> = {
  no_hosting:
    "Say how the data is kept in Kenya: processed through a server and data centre in Kenya, or with at least one serving copy kept in a data centre in Kenya (reg. 26(1)).",
  no_data_centre:
    "Name the data centre in Kenya, such as the hosting provider and town or your own server room, and for a serving copy, how it's kept up to date.",
  processed_abroad:
    "A processor linked to this activity holds the data outside Kenya, but the record says it's processed only in Kenya. Keep a serving copy in Kenya and say so, or move the processing here (reg. 26(1)).",
};

/** The issues as one next step on the dashboard. */
export function dataLocalisationTodo(a: Pick<DataLocalisationLike, "name">, issues: DataLocalisationIssue[]): string {
  if (issues.includes("processed_abroad")) return `Keep a copy in Kenya of the data in ${a.name}, which a processor holds abroad`;
  return `Say ${joinAnd(issues.filter((i) => i !== "processed_abroad").map((i) => TODO_PART[i]))} for ${a.name}`;
}

const TODO_PART: Record<Exclude<DataLocalisationIssue, "processed_abroad">, string> = {
  no_hosting: "how the data is kept in Kenya",
  no_data_centre: "which data centre in Kenya holds it",
};

/** The same issues as the compliance report states them. */
export function dataLocalisationFinding(
  a: Pick<DataLocalisationLike, "name" | "kenyaDataPurpose">,
  issues: DataLocalisationIssue[],
  processors: LocalisationProcessor[] = [],
): string {
  const section = KENYA_DATA_PURPOSE_SECTION[a.kenyaDataPurpose as KenyaDataPurpose] ?? "reg. 26(2)";
  const parts: string[] = [];
  const missing = issues.filter((i) => i !== "processed_abroad");
  if (missing.length > 0) parts.push(`the record doesn't say ${joinAnd(missing.map((i) => FINDING_PART[i]))}`);
  if (issues.includes("processed_abroad")) {
    const abroad = offshoreProcessors(processors);
    parts.push(`it's recorded as processed only in Kenya, but ${joinAnd(abroad.map((p) => p.name))} ${abroad.length === 1 ? "holds" : "hold"} the data outside Kenya`);
  }
  return `${a.name} has to be kept in Kenya (${section}: ${describeKenyaDataPurpose(a)}), and ${parts.join(", and ")}.`;
}

const FINDING_PART: Record<Exclude<DataLocalisationIssue, "processed_abroad">, string> = {
  no_hosting: "how (reg. 26(1))",
  no_data_centre: "which data centre in Kenya holds it",
};

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The activities that need their data kept in Kenya and have something
 * missing, with what. `processorsOf` gives each activity's linked processors.
 */
export function activitiesWithDataLocalisationIssues<A extends DataLocalisationLike>(
  activities: A[],
  processorsOf: (a: A) => LocalisationProcessor[] = () => [],
): { activity: A; issues: DataLocalisationIssue[] }[] {
  return activities.map((activity) => ({ activity, issues: dataLocalisationIssues(activity, processorsOf(activity)) })).filter((x) => x.issues.length > 0);
}

/** The reg. 26(2) purpose, as the RoPA export and the report show it. Empty when none applies. */
export function describeKenyaDataPurpose(a: Pick<DataLocalisationLike, "kenyaDataPurpose">): string {
  if (!a.kenyaDataPurpose) return "";
  return KENYA_DATA_PURPOSES[a.kenyaDataPurpose as KenyaDataPurpose] ?? a.kenyaDataPurpose;
}

/** How the data is kept in Kenya, as the RoPA export and the report show it. */
export function describeKenyaHosting(a: Pick<DataLocalisationLike, "kenyaDataPurpose" | "kenyaHosting">): string {
  if (!a.kenyaDataPurpose) return "";
  if (!a.kenyaHosting) return "Not recorded";
  return KENYA_HOSTING[a.kenyaHosting as KenyaHosting] ?? a.kenyaHosting;
}

/** What reg. 26 asks when it applies, as a checklist on the activity's page. */
export const DATA_LOCALISATION_CHECKLIST = [
  "The data is processed through a server and data centre in Kenya, or at least one serving copy is kept in a data centre in Kenya (reg. 26(1))",
  "A serving copy is current and usable, not an old backup, so the service could run from it",
  "Cloud services and processors for the activity say where they hold the data, and the contract keeps a copy in Kenya where they're abroad",
  "Any transfer outside Kenya still has the safeguards ss.48 and 49 ask for; keeping a copy here doesn't replace them",
  "Regulation 26 applies to processors as well as controllers",
] as const;

/** Each activity's processors, from the processor register and its links, for the checks above. */
export function processorsByActivity<P extends LocalisationProcessor & { id: string }>(
  processors: P[],
  links: { processorId: string; activityId: string }[],
): (activityId: string) => P[] {
  const byId = new Map(processors.map((p) => [p.id, p]));
  const byActivity = new Map<string, P[]>();
  for (const l of links) {
    const p = byId.get(l.processorId);
    if (p) byActivity.set(l.activityId, [...(byActivity.get(l.activityId) ?? []), p]);
  }
  return (activityId) => byActivity.get(activityId) ?? [];
}
