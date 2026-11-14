import { z } from "zod";
import { AUTOMATED_DECISION_GROUND_KEYS, AUTOMATED_DECISION_GROUNDS, type AutomatedDecisionGround } from "./automated-decision";
import { describeParentalConsent } from "./children-data";
import { MARKETING_GROUND_KEYS, MARKETING_GROUNDS, type MarketingGround } from "./direct-marketing";
import { LAWFUL_BASES, LAWFUL_BASIS_KEYS, SENSITIVE_CATEGORIES, type LawfulBasis, type Sector } from "./dpa";
import {
  describeKenyaDataPurpose,
  describeKenyaHosting,
  KENYA_DATA_PURPOSE_KEYS,
  KENYA_HOSTING_KEYS,
  type KenyaDataPurpose,
  type KenyaHosting,
} from "./data-localisation";
import { describeIndirectCollectionGrounds, INDIRECT_COLLECTION_GROUND_KEYS, type IndirectCollectionGround } from "./indirect-collection";
import { describeRetention, MAX_RETENTION_YEARS, RETENTION_UNIT_KEYS, type RetentionUnit } from "./retention";
import {
  describeHealthDataCondition,
  describeSensitiveDataGround,
  HEALTH_DATA_CONDITION_KEYS,
  type HealthDataCondition,
  involvesHealthData,
  SENSITIVE_DATA_GROUND_KEYS,
  type SensitiveDataGround,
} from "./sensitive-data";

/** The organisation's part in an activity: deciding why and how the data is used, or handling it for someone who does. */
export const ACTIVITY_ROLES = {
  controller: "Controller: you decide why and how the data is used",
  processor: "Processor: you handle it on another organisation's instructions",
} as const;

export type ActivityRole = keyof typeof ACTIVITY_ROLES;

/** One entry in a Record of Processing Activities. */
export interface ActivityInput {
  name: string;
  purpose: string;
  lawfulBasis: LawfulBasis;
  /** Null when nobody has said yet, for activities recorded before the question was asked. */
  role: ActivityRole | null;
  /** Whether people must give the data, and what happens if they don't. */
  provision: string;
  dataSubjects: string[];
  dataCategories: string[];
  sensitiveCategories: string[];
  /** What s.45 allows the sensitive data to be processed under; null until someone says. */
  sensitiveDataGround: SensitiveDataGround | null;
  /** What the ground rests on: the law, the claim, where the person made the data public. */
  sensitiveDataBasis: string;
  /** Who handles data about people's health (s.46); null until someone says, or when there is none. */
  healthDataCondition: HealthDataCondition | null;
  /** How the sensitive data is protected and kept apart from the rest (reg. 32(i)). */
  sensitiveDataSafeguards: string;
  /** Some of the data is collected from someone other than the person it's about (s.28; reg. 6 of the General Regulations). */
  indirectCollection: boolean;
  /** Where it comes from: other people, databases, cameras, browsing, biometrics (reg. 6(1)). */
  indirectSources: string;
  /** What s.28(2) allows it under, in the Act's order; empty until someone says. */
  indirectCollectionGrounds: IndirectCollectionGround[];
  /** How people are told within 14 days (reg. 6(3)). */
  indirectCollectionNotice: string;
  recipients: string;
  crossBorder: boolean;
  transferCountries: string;
  transferSafeguards: string;
  /** The reg. 26(2) purpose that means the data has to be kept in Kenya. Null when none applies. */
  kenyaDataPurpose: KenyaDataPurpose | null;
  /** Which of reg. 26(1)(a) and (b) keeps it in Kenya. Null until someone says. */
  kenyaHosting: KenyaHosting | null;
  /** The data centre in Kenya, and for a serving copy how it's kept current. */
  kenyaDataCentre: string;
  retentionPeriod: string;
  /** The period as a length Kinga can count with. Both null when it has no fixed length. */
  retentionLength: number | null;
  retentionUnit: RetentionUnit | null;
  /** What the period is counted from, such as "the end of employment". */
  retentionFrom: string;
  securityMeasures: string;
  systems: string;
  owner: string;
  largeScale: boolean;
  systematicMonitoring: boolean;
  /** Children's data is processed (s.33; reg. 13(2) of the General Regulations). */
  involvesChildren: boolean;
  /** How a child's data is told apart from an adult's (s.33(2)). */
  childAgeCheck: string;
  /** Only counselling or child protection services for children, so parental consent may not be needed (s.33(4)). */
  childCounselling: boolean;
  /** How a parent or guardian consents, and how they're identified (s.33(1)(a); reg. 13(2)(a)). */
  parentalConsent: string;
  /** How the processing protects the child, and how parents are told the risks and safeguards (s.33(1)(b); reg. 13(2)(c)). */
  childSafeguards: string;
  /** Decisions about people taken by automated means alone, with legal or similarly significant effects (s.35). */
  automatedDecisions: boolean;
  /** What s.35(2) allows them under; null until someone says. */
  automatedDecisionGround: AutomatedDecisionGround | null;
  /** What is decided, the logic involved and what it means for the person. */
  automatedDecisionLogic: string;
  /** How people are told, and how they ask for a person to reconsider. */
  automatedDecisionReview: string;
  /** How errors and bias are checked for. */
  automatedDecisionChecks: string;
  /** Personal data used for direct marketing (s.37; regs. 14-18 of the General Regulations). */
  directMarketing: boolean;
  /** What s.37(1) allows it under; null until someone says. */
  marketingGround: MarketingGround | null;
  /** How people are marketed to: the channels and what is sent. */
  marketingChannels: string;
  /** How people opt out, free of charge. */
  marketingOptOut: string;
  /** Where opt-outs are kept and how they're checked before anything is sent. */
  marketingOptOutRecords: string;
}

const list = z
  .string()
  .transform((s) =>
    s
      .split(/[\n,]/)
      .map((x) => x.trim())
      .filter(Boolean),
  );

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal(""), z.null(), z.undefined()])
  .transform((v) => v === "on" || v === "true");

/** Parses the RoPA form. List fields accept comma- or newline-separated text. */
export const activityFormSchema = z
  .object({
    name: z.string().trim().min(2, { error: "Give the activity a name." }).max(200),
    purpose: z.string().trim().min(5, { error: "Describe why you process this data." }).max(2000),
    lawfulBasis: z.enum(LAWFUL_BASIS_KEYS as [LawfulBasis, ...LawfulBasis[]], {
      error: "Choose a lawful basis.",
    }),
    role: z.enum(["controller", "processor"], { error: "Choose your role." }),
    provision: z.string().trim().max(1000).default(""),
    dataSubjects: list.pipe(z.array(z.string()).min(1, { error: "List at least one category of data subject." })),
    dataCategories: list.pipe(z.array(z.string()).min(1, { error: "List at least one category of personal data." })),
    sensitiveCategories: z
      .array(z.enum(SENSITIVE_CATEGORIES, { error: "Choose from the listed categories." }))
      .max(SENSITIVE_CATEGORIES.length)
      .default([]),
    sensitiveDataGround: z
      .union([z.literal(""), z.enum(SENSITIVE_DATA_GROUND_KEYS as [SensitiveDataGround, ...SensitiveDataGround[]])], {
        error: "Choose from the listed grounds.",
      })
      .default("")
      .transform((v) => v || null),
    sensitiveDataBasis: z.string().trim().max(2000).default(""),
    healthDataCondition: z
      .union([z.literal(""), z.enum(HEALTH_DATA_CONDITION_KEYS as [HealthDataCondition, ...HealthDataCondition[]])], {
        error: "Choose from the listed conditions.",
      })
      .default("")
      .transform((v) => v || null),
    sensitiveDataSafeguards: z.string().trim().max(2000).default(""),
    indirectCollection: checkbox,
    indirectSources: z.string().trim().max(2000).default(""),
    indirectCollectionGrounds: z
      .array(z.enum(INDIRECT_COLLECTION_GROUND_KEYS as [IndirectCollectionGround, ...IndirectCollectionGround[]], { error: "Choose from the listed grounds." }))
      .default([])
      // In the Act's order, without repeats, so ticking the same boxes again isn't a change.
      .transform((v) => INDIRECT_COLLECTION_GROUND_KEYS.filter((k) => v.includes(k))),
    indirectCollectionNotice: z.string().trim().max(2000).default(""),
    recipients: z.string().trim().max(2000).default(""),
    crossBorder: checkbox,
    transferCountries: z.string().trim().max(500).default(""),
    transferSafeguards: z.string().trim().max(2000).default(""),
    kenyaDataPurpose: z
      .union([z.literal(""), z.enum(KENYA_DATA_PURPOSE_KEYS as [KenyaDataPurpose, ...KenyaDataPurpose[]])], {
        error: "Choose from the listed purposes.",
      })
      .default("")
      .transform((v) => v || null),
    kenyaHosting: z
      .union([z.literal(""), z.enum(KENYA_HOSTING_KEYS as [KenyaHosting, ...KenyaHosting[]])], { error: "Choose how the data is kept in Kenya." })
      .default("")
      .transform((v) => v || null),
    kenyaDataCentre: z.string().trim().max(2000).default(""),
    retentionPeriod: z.string().trim().min(1, { error: "State how long you keep the data." }).max(500),
    retentionLength: z
      .string()
      .trim()
      .default("")
      .refine((v) => v === "" || (/^\d{1,5}$/.test(v) && Number(v) > 0), { error: "Enter a whole number, or leave it blank." })
      .transform((v) => (v === "" ? null : Number(v))),
    retentionUnit: z
      .union([z.literal(""), z.enum(RETENTION_UNIT_KEYS as [RetentionUnit, ...RetentionUnit[]])], {
        error: "Choose days, months or years.",
      })
      .default("")
      .transform((v) => v || null),
    retentionFrom: z.string().trim().max(200).default(""),
    securityMeasures: z.string().trim().max(2000).default(""),
    systems: z.string().trim().max(500).default(""),
    owner: z.string().trim().max(200).default(""),
    largeScale: checkbox,
    systematicMonitoring: checkbox,
    involvesChildren: checkbox,
    childAgeCheck: z.string().trim().max(2000).default(""),
    childCounselling: checkbox,
    parentalConsent: z.string().trim().max(2000).default(""),
    childSafeguards: z.string().trim().max(2000).default(""),
    automatedDecisions: checkbox,
    automatedDecisionGround: z
      .union([z.literal(""), z.enum(AUTOMATED_DECISION_GROUND_KEYS as [AutomatedDecisionGround, ...AutomatedDecisionGround[]])], {
        error: "Choose from the listed grounds.",
      })
      .default("")
      .transform((v) => v || null),
    automatedDecisionLogic: z.string().trim().max(2000).default(""),
    automatedDecisionReview: z.string().trim().max(2000).default(""),
    automatedDecisionChecks: z.string().trim().max(2000).default(""),
    directMarketing: checkbox,
    marketingGround: z
      .union([z.literal(""), z.enum(MARKETING_GROUND_KEYS as [MarketingGround, ...MarketingGround[]])], {
        error: "Choose from the listed grounds.",
      })
      .default("")
      .transform((v) => v || null),
    marketingChannels: z.string().trim().max(2000).default(""),
    marketingOptOut: z.string().trim().max(2000).default(""),
    marketingOptOutRecords: z.string().trim().max(2000).default(""),
  })
  .refine((v) => !v.crossBorder || v.transferCountries !== "", {
    path: ["transferCountries"],
    error: "Name the countries data is transferred to.",
    // Run even when unrelated fields fail, so every error shows on the first submit.
    when: ({ issues }) => !issues.some((i) => ["crossBorder", "transferCountries"].includes(String(i.path?.[0]))),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (v.retentionLength !== null && v.retentionUnit === null) issue("retentionUnit", "Choose days, months or years.");
    if (v.retentionLength === null && v.retentionUnit !== null) issue("retentionLength", "Give the length, or leave the unit blank.");
    if (v.retentionLength === null && v.retentionUnit === null && v.retentionFrom) {
      issue("retentionLength", "Give the length the period runs for, or leave what it counts from blank.");
    }
    if (v.retentionLength !== null && v.retentionUnit !== null && tooLong(v.retentionLength, v.retentionUnit)) {
      issue("retentionLength", `Keep it to ${MAX_RETENTION_YEARS} years. For data kept permanently, say so in the retention period and leave the length blank.`);
    }
  });

/** Longer than the most a period may run for. */
function tooLong(length: number, unit: RetentionUnit): boolean {
  const max = { days: Math.floor(MAX_RETENTION_YEARS * 365.25), months: MAX_RETENTION_YEARS * 12, years: MAX_RETENTION_YEARS };
  return length > max[unit];
}

export function parseActivityForm(formData: FormData) {
  const get = (k: string) => formData.get(k) ?? undefined;
  return activityFormSchema.safeParse({
    name: get("name"),
    purpose: get("purpose"),
    lawfulBasis: get("lawfulBasis"),
    role: get("role"),
    provision: get("provision"),
    dataSubjects: get("dataSubjects") ?? "",
    dataCategories: get("dataCategories") ?? "",
    sensitiveCategories: formData.getAll("sensitiveCategories").map(String),
    sensitiveDataGround: get("sensitiveDataGround"),
    sensitiveDataBasis: get("sensitiveDataBasis"),
    healthDataCondition: get("healthDataCondition"),
    sensitiveDataSafeguards: get("sensitiveDataSafeguards"),
    indirectCollection: get("indirectCollection"),
    indirectSources: get("indirectSources"),
    indirectCollectionGrounds: formData.getAll("indirectCollectionGrounds").map(String),
    indirectCollectionNotice: get("indirectCollectionNotice"),
    recipients: get("recipients"),
    crossBorder: get("crossBorder"),
    transferCountries: get("transferCountries"),
    transferSafeguards: get("transferSafeguards"),
    kenyaDataPurpose: get("kenyaDataPurpose"),
    kenyaHosting: get("kenyaHosting"),
    kenyaDataCentre: get("kenyaDataCentre"),
    retentionPeriod: get("retentionPeriod"),
    retentionLength: get("retentionLength"),
    retentionUnit: get("retentionUnit"),
    retentionFrom: get("retentionFrom"),
    securityMeasures: get("securityMeasures"),
    systems: get("systems"),
    owner: get("owner"),
    largeScale: get("largeScale"),
    systematicMonitoring: get("systematicMonitoring"),
    involvesChildren: get("involvesChildren"),
    childAgeCheck: get("childAgeCheck"),
    childCounselling: get("childCounselling"),
    parentalConsent: get("parentalConsent"),
    childSafeguards: get("childSafeguards"),
    automatedDecisions: get("automatedDecisions"),
    automatedDecisionGround: get("automatedDecisionGround"),
    automatedDecisionLogic: get("automatedDecisionLogic"),
    automatedDecisionReview: get("automatedDecisionReview"),
    automatedDecisionChecks: get("automatedDecisionChecks"),
    directMarketing: get("directMarketing"),
    marketingGround: get("marketingGround"),
    marketingChannels: get("marketingChannels"),
    marketingOptOut: get("marketingOptOut"),
    marketingOptOutRecords: get("marketingOptOutRecords"),
  });
}

/**
 * The activity as saved: the indirect collection, children's data, transfer,
 * automated decision and direct marketing details are kept only when the
 * activity says it gets data from others, involves children, transfers data,
 * takes such decisions or markets to people, so unticking the box clears what
 * was entered under it. Likewise the sensitive data details go when no sensitive category
 * is ticked, the health condition when health status isn't, and how a parent
 * consents when the activity is counselling or child protection only (s.33(4)),
 * since the form hides that question then, and how the data is kept in Kenya
 * when no reg. 26(2) purpose is chosen.
 */
export function activityToSave<T extends ActivityInput>(a: T): T {
  const sensitive = a.sensitiveCategories.length > 0;
  return {
    ...a,
    sensitiveDataGround: sensitive ? a.sensitiveDataGround : null,
    sensitiveDataBasis: sensitive ? a.sensitiveDataBasis : "",
    healthDataCondition: involvesHealthData(a) ? a.healthDataCondition : null,
    sensitiveDataSafeguards: sensitive ? a.sensitiveDataSafeguards : "",
    indirectSources: a.indirectCollection ? a.indirectSources : "",
    indirectCollectionGrounds: a.indirectCollection ? a.indirectCollectionGrounds : [],
    indirectCollectionNotice: a.indirectCollection ? a.indirectCollectionNotice : "",
    childAgeCheck: a.involvesChildren ? a.childAgeCheck : "",
    childCounselling: a.involvesChildren && a.childCounselling,
    parentalConsent: a.involvesChildren && !a.childCounselling ? a.parentalConsent : "",
    childSafeguards: a.involvesChildren ? a.childSafeguards : "",
    transferCountries: a.crossBorder ? a.transferCountries : "",
    transferSafeguards: a.crossBorder ? a.transferSafeguards : "",
    kenyaHosting: a.kenyaDataPurpose ? a.kenyaHosting : null,
    kenyaDataCentre: a.kenyaDataPurpose ? a.kenyaDataCentre : "",
    automatedDecisionGround: a.automatedDecisions ? a.automatedDecisionGround : null,
    automatedDecisionLogic: a.automatedDecisions ? a.automatedDecisionLogic : "",
    automatedDecisionReview: a.automatedDecisions ? a.automatedDecisionReview : "",
    automatedDecisionChecks: a.automatedDecisions ? a.automatedDecisionChecks : "",
    marketingGround: a.directMarketing ? a.marketingGround : null,
    marketingChannels: a.directMarketing ? a.marketingChannels : "",
    marketingOptOut: a.directMarketing ? a.marketingOptOut : "",
    marketingOptOutRecords: a.directMarketing ? a.marketingOptOutRecords : "",
  };
}

// ---------------------------------------------------------------------------
// DPIA screening
// ---------------------------------------------------------------------------

type DpiaInput = Pick<
  ActivityInput,
  "sensitiveCategories" | "crossBorder" | "largeScale" | "systematicMonitoring" | "involvesChildren" | "automatedDecisions"
>;

/**
 * Reasons an activity is likely to need a Data Protection Impact Assessment
 * (s.31 of the Act: processing "likely to result in high risk"). This is a
 * screening aid, not a legal determination.
 */
export function dpiaTriggers(a: DpiaInput): string[] {
  const reasons: string[] = [];
  if (a.automatedDecisions) reasons.push("Decisions about people taken by automated means alone (reg. 49(1)(a) of the General Regulations)");
  if (a.systematicMonitoring) reasons.push("Systematic monitoring (e.g. CCTV, location or behaviour tracking)");
  if (a.sensitiveCategories.length > 0 && a.largeScale) reasons.push("Large-scale processing of sensitive personal data");
  else if (a.sensitiveCategories.length > 0) reasons.push("Processing of sensitive personal data");
  if (a.involvesChildren) reasons.push("Processing of children's data");
  if (a.crossBorder) reasons.push("Transfer of personal data outside Kenya");
  return reasons;
}

/**
 * Two or more triggers, or systematic monitoring or automated decisions alone,
 * means a DPIA is recommended. Regulation 49(1)(a) names automated decisions
 * with legal or similarly significant effects as high risk in themselves.
 */
export function dpiaRecommended(a: DpiaInput): boolean {
  const reasons = dpiaTriggers(a);
  return reasons.length >= 2 || a.systematicMonitoring || a.automatedDecisions;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ROPA_COLUMNS: { header: string; value: (a: ActivityInput) => string }[] = [
  { header: "Processing activity", value: (a) => a.name },
  { header: "Purpose", value: (a) => a.purpose },
  { header: "Lawful basis", value: (a) => LAWFUL_BASES[a.lawfulBasis] },
  { header: "Role", value: (a) => (a.role === "processor" ? "Processor" : a.role === "controller" ? "Controller" : "Not confirmed") },
  { header: "Mandatory or voluntary", value: (a) => a.provision },
  { header: "Categories of data subjects", value: (a) => a.dataSubjects.join("; ") },
  { header: "Categories of personal data", value: (a) => a.dataCategories.join("; ") },
  { header: "Sensitive personal data", value: (a) => a.sensitiveCategories.join("; ") || "None" },
  {
    header: "What allows the sensitive data (s.45)",
    // A processor isn't asked for the ground, which is the controller's to
    // give, so a blank one isn't shown as missing (as in the compliance report).
    value: (a) =>
      a.sensitiveCategories.length > 0
        ? (describeSensitiveDataGround(a.sensitiveDataGround) ?? (a.role === "processor" ? "For the controller to say" : "Not recorded"))
        : "",
  },
  { header: "What the s.45 ground rests on", value: (a) => (a.sensitiveCategories.length > 0 ? a.sensitiveDataBasis : "") },
  {
    header: "Who handles the health data (s.46)",
    value: (a) => (involvesHealthData(a) ? (describeHealthDataCondition(a.healthDataCondition) ?? "Not recorded") : ""),
  },
  { header: "Sensitive data safeguards", value: (a) => (a.sensitiveCategories.length > 0 ? a.sensitiveDataSafeguards : "") },
  { header: "Collected from others", value: (a) => (a.indirectCollection ? `Yes: ${a.indirectSources || "sources not recorded"}` : "No") },
  {
    header: "What allows collecting it from others (s.28(2))",
    // As with s.45, the ground is the controller's to give.
    value: (a) =>
      a.indirectCollection
        ? describeIndirectCollectionGrounds(a.indirectCollectionGrounds).join("; ") || (a.role === "processor" ? "For the controller to say" : "Not recorded")
        : "",
  },
  { header: "How people are told it came from others", value: (a) => (a.indirectCollection ? a.indirectCollectionNotice : "") },
  { header: "Children's data", value: (a) => (a.involvesChildren ? "Yes" : "No") },
  { header: "How a child's data is told apart (s.33(2))", value: (a) => (a.involvesChildren ? a.childAgeCheck : "") },
  // As with s.45, getting the consent is the controller's to do.
  { header: "How a parent or guardian consents (s.33(1)(a))", value: describeParentalConsent },
  { header: "How children are protected (s.33(1)(b))", value: (a) => (a.involvesChildren ? a.childSafeguards : "") },
  { header: "Recipients", value: (a) => a.recipients },
  {
    header: "Transfers outside Kenya",
    value: (a) => (a.crossBorder ? `Yes: ${a.transferCountries}` : "No"),
  },
  { header: "Transfer safeguards", value: (a) => (a.crossBorder ? a.transferSafeguards : "") },
  { header: "Has to be kept in Kenya (reg. 26(2))", value: (a) => describeKenyaDataPurpose(a) || "No" },
  { header: "How it's kept in Kenya (reg. 26(1))", value: (a) => describeKenyaHosting(a) },
  { header: "Data centre in Kenya", value: (a) => (a.kenyaDataPurpose ? a.kenyaDataCentre : "") },
  { header: "Retention period", value: (a) => a.retentionPeriod },
  { header: "Retention period as a length", value: (a) => describeRetention(a) ?? "" },
  { header: "Security measures", value: (a) => a.securityMeasures },
  { header: "Systems / location", value: (a) => a.systems },
  { header: "Owner", value: (a) => a.owner },
  {
    header: "Automated decisions",
    value: (a) =>
      a.automatedDecisions ? `Yes: ${a.automatedDecisionGround ? AUTOMATED_DECISION_GROUNDS[a.automatedDecisionGround] : "ground not recorded"}` : "No",
  },
  { header: "Automated decision logic", value: (a) => (a.automatedDecisions ? a.automatedDecisionLogic : "") },
  { header: "How people ask for a person to reconsider", value: (a) => (a.automatedDecisions ? a.automatedDecisionReview : "") },
  { header: "Checks for errors and bias", value: (a) => (a.automatedDecisions ? a.automatedDecisionChecks : "") },
  {
    header: "Direct marketing",
    value: (a) => (a.directMarketing ? `Yes: ${a.marketingGround ? MARKETING_GROUNDS[a.marketingGround] : "ground not recorded"}` : "No"),
  },
  { header: "How people are marketed to", value: (a) => (a.directMarketing ? a.marketingChannels : "") },
  { header: "How people opt out of marketing", value: (a) => (a.directMarketing ? a.marketingOptOut : "") },
  { header: "Where marketing opt-outs are kept", value: (a) => (a.directMarketing ? a.marketingOptOutRecords : "") },
  { header: "DPIA recommended", value: (a) => (dpiaRecommended(a) ? "Yes" : "No") },
];

function csvCell(value: string): string {
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function ropaToCsv(activities: ActivityInput[]): string {
  const rows = [
    ROPA_COLUMNS.map((c) => csvCell(c.header)).join(","),
    ...activities.map((a) => ROPA_COLUMNS.map((c) => csvCell(c.value(a))).join(",")),
  ];
  // BOM so Excel opens UTF-8 correctly.
  return "﻿" + rows.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface ActivityTemplate extends ActivityInput {
  id: string;
  sectors: Sector[] | "all";
}

const base = {
  role: "controller",
  provision: "",
  sensitiveCategories: [],
  sensitiveDataGround: null,
  sensitiveDataBasis: "",
  healthDataCondition: null,
  sensitiveDataSafeguards: "",
  indirectCollection: false,
  indirectSources: "",
  indirectCollectionGrounds: [],
  indirectCollectionNotice: "",
  crossBorder: false,
  transferCountries: "",
  transferSafeguards: "",
  kenyaDataPurpose: null,
  kenyaHosting: null,
  kenyaDataCentre: "",
  largeScale: false,
  systematicMonitoring: false,
  involvesChildren: false,
  childAgeCheck: "",
  childCounselling: false,
  parentalConsent: "",
  childSafeguards: "",
  owner: "",
  retentionLength: null,
  retentionUnit: null,
  retentionFrom: "",
  automatedDecisions: false,
  automatedDecisionGround: null,
  automatedDecisionLogic: "",
  automatedDecisionReview: "",
  automatedDecisionChecks: "",
  directMarketing: false,
  marketingGround: null,
  marketingChannels: "",
  marketingOptOut: "",
  marketingOptOutRecords: "",
} satisfies Partial<ActivityInput>;

/** A template's retention period as a length, where its wording gives one. */
const keep = (retentionLength: number, retentionUnit: RetentionUnit, retentionFrom: string) => ({ retentionLength, retentionUnit, retentionFrom });

/**
 * Starter RoPA entries by sector. Users add the ones that apply and then edit
 * them to match what they actually do. The templates are only a starting point.
 */
export const ACTIVITY_TEMPLATES: ActivityTemplate[] = [
  {
    ...base,
    id: "hr-payroll",
    sectors: "all",
    name: "Staff records and payroll",
    provision: "Yes for what we need to employ and pay you, such as your ID number, KRA PIN and bank details. Without them we can't employ or pay you. Health and family details are needed only where a benefit or statutory deduction depends on them.",
    purpose: "Recruit and employ staff, pay salaries, and meet statutory deductions (PAYE, NSSF, SHIF, Housing Levy).",
    lawfulBasis: "contract",
    dataSubjects: ["Employees", "Job applicants", "Next of kin"],
    dataCategories: ["Name", "National ID number", "KRA PIN", "Bank details", "Contact details", "Employment history"],
    sensitiveCategories: ["Health status", "Family details (children, parents, spouse)", "Marital status"],
    sensitiveDataGround: "obligations",
    sensitiveDataBasis:
      "The Employment Act, 2007 (sick leave on a medical certificate) and the tax and social security laws that set deductions, reliefs and dependants' cover.",
    sensitiveDataSafeguards:
      "Medical certificates and dependants' details are kept in a separate, locked HR file, not in the payroll system, and only HR can open it.",
    indirectCollection: true,
    indirectSources: "Next of kin and dependants' details, given by the employee. References from former employers the applicant names.",
    indirectCollectionGrounds: ["consent", "no_prejudice"],
    recipients: "KRA, NSSF, SHA, payroll provider, bank",
    retentionPeriod: "7 years after employment ends",
    ...keep(7, "years", "the end of employment"),
    securityMeasures: "Access restricted to HR and finance; payroll system with individual logins",
    systems: "Payroll software, HR files",
  },
  {
    ...base,
    id: "cctv",
    sectors: "all",
    name: "CCTV surveillance",
    provision: "The cameras record everyone in the areas they cover, which are marked with signs.",
    purpose: "Protect premises, staff and visitors, and investigate incidents.",
    lawfulBasis: "legitimate_interests",
    dataSubjects: ["Staff", "Visitors", "Customers"],
    dataCategories: ["Video footage"],
    indirectCollection: true,
    indirectSources: "The cameras on the premises.",
    indirectCollectionGrounds: ["crime"],
    indirectCollectionNotice: "Signs at each entrance and in the areas the cameras cover say that recording is taking place, why, and who to contact.",
    recipients: "Security contractor; police on lawful request",
    retentionPeriod: "30 days unless needed for an investigation",
    ...keep(30, "days", "recording"),
    securityMeasures: "DVR in locked room; viewing limited to security lead; signage at entrances",
    systems: "On-site DVR",
    systematicMonitoring: true,
  },
  {
    ...base,
    id: "marketing",
    sectors: ["retail", "hospitality", "fintech", "sacco", "other"],
    name: "Marketing messages",
    purpose: "Send promotions and updates by SMS, WhatsApp and email to customers who opted in.",
    lawfulBasis: "consent",
    dataSubjects: ["Customers", "Prospective customers"],
    dataCategories: ["Name", "Phone number", "Email address", "Purchase history"],
    recipients: "Bulk SMS provider, email service provider",
    crossBorder: true,
    transferCountries: "United States (email service provider)",
    transferSafeguards: "Contractual clauses with provider; provider's data protection terms",
    retentionPeriod: "Until consent is withdrawn, or 2 years after last interaction",
    ...keep(2, "years", "the last interaction"),
    securityMeasures: "Access to the CRM and bulk SMS platform limited to the marketing team",
    systems: "CRM, bulk SMS platform",
    directMarketing: true,
    marketingGround: "consent",
    marketingChannels: "Offers and news by SMS and WhatsApp, and a monthly email newsletter.",
    marketingOptOut: "Reply STOP to any SMS or WhatsApp message, free of charge, or use the unsubscribe link in any email.",
    marketingOptOutRecords:
      "Opt-outs go on the unsubscribe list in the CRM within a day, and the list is removed from every send. It is never deleted while we hold the person's number or email.",
  },
  {
    ...base,
    id: "student-records",
    sectors: ["education"],
    name: "Student admission and academic records",
    provision: "Yes. We need it to admit and teach a student and to report to the Ministry of Education. Without it we can't offer a place.",
    purpose: "Admit students, manage academic progress, and report to the Ministry of Education (NEMIS/KEMIS).",
    lawfulBasis: "legal_obligation",
    dataSubjects: ["Students", "Parents and guardians"],
    dataCategories: ["Name", "Date of birth", "Birth certificate number", "Photograph", "Academic results", "Parent contact details"],
    sensitiveCategories: ["Health status", "Family details (children, parents, spouse)"],
    sensitiveDataGround: "obligations",
    sensitiveDataBasis: "The Basic Education Act, 2013 and the Children Act, 2022: the school's duty of care for its pupils, including their health needs.",
    sensitiveDataSafeguards: "Medical forms are kept in a separate locked file held by the school nurse or the head teacher, not in the general student file.",
    indirectCollection: true,
    indirectSources:
      "Parents and guardians give their children's details on the admission form. The pupil's previous school sends their records, such as the leaving certificate and report forms.",
    indirectCollectionGrounds: ["no_prejudice"],
    indirectCollectionNotice:
      "Parents and guardians, who act for their children (s.27(a)), fill in the admission form themselves. It says what the school collects and why, and that it will ask the previous school for the pupil's records.",
    recipients: "Ministry of Education, KNEC, examination bodies",
    retentionPeriod: "Duration of enrolment plus 7 years; academic transcripts permanently",
    ...keep(7, "years", "the pupil leaving"),
    securityMeasures: "School management system with role-based access; paper files in locked cabinets",
    systems: "School management system, NEMIS",
    kenyaDataPurpose: "basic_education",
    involvesChildren: true,
    childAgeCheck:
      "The admission form asks for the pupil's date of birth and birth certificate number, and the office checks them against the birth certificate.",
    parentalConsent:
      "A parent or guardian signs the admission form, which says what the school collects and why. The office checks their ID, and that the birth certificate or other proof names them as the parent or guardian.",
    childSafeguards:
      "Only the class teacher, the head teacher and the office open a pupil's file, and health details stay with the school nurse. Pupils' data is shared only with the bodies listed and never used for marketing. The admission pack tells parents who sees their child's data and how it's protected.",
    largeScale: true,
  },
  {
    ...base,
    id: "school-fees",
    sectors: ["education"],
    name: "School fees and billing",
    provision: "Yes. We need it to bill you and record what you've paid.",
    purpose: "Invoice and collect fees, issue receipts, and follow up arrears.",
    lawfulBasis: "contract",
    dataSubjects: ["Parents and guardians", "Students"],
    dataCategories: ["Name", "Phone number", "M-Pesa transaction details", "Fee balance"],
    indirectCollection: true,
    indirectSources: "Parents and guardians give their children's names and classes.",
    indirectCollectionGrounds: ["no_prejudice"],
    indirectCollectionNotice: "Parents and guardians, who act for their children (s.27(a)), give these details themselves.",
    recipients: "Bank, M-Pesa (Safaricom), auditors",
    retentionPeriod: "7 years (tax and audit requirements)",
    ...keep(7, "years", "the payment"),
    securityMeasures: "Finance office access only",
    systems: "Accounting software",
    kenyaDataPurpose: "basic_education",
    involvesChildren: true,
    childAgeCheck: "Fees are billed only for pupils the school has admitted, whose dates of birth the admission records hold.",
    parentalConsent:
      "The parent or guardian who signs the admission form agrees to the fees terms on it, and statements go only to the phone number on that form.",
    childSafeguards:
      "Statements show only the pupil's name, class and balance, and go only to the parent or guardian. Arrears are never raised with the pupil or in front of others. The fees policy tells parents this.",
  },
  {
    ...base,
    id: "patient-records",
    sectors: ["health"],
    name: "Patient medical records",
    provision: "Yes. We need it to treat you safely, and without it we may not be able to.",
    purpose: "Diagnose and treat patients and keep clinical records.",
    lawfulBasis: "vital_interests",
    dataSubjects: ["Patients", "Next of kin"],
    dataCategories: ["Name", "National ID number", "Contact details", "Clinical notes", "Lab results", "Prescriptions"],
    sensitiveCategories: ["Health status", "Genetic data", "Family details (children, parents, spouse)"],
    sensitiveDataGround: "obligations",
    sensitiveDataBasis: "The Health Act, 2017: a health care provider's duty to keep a record of each patient's care.",
    healthDataCondition: "health_care_provider",
    sensitiveDataSafeguards:
      "Clinical records are kept in the EMR, apart from billing and front-desk data. Each role sees only what it needs, and every access is logged.",
    indirectCollection: true,
    indirectSources: "Next of kin's details, given by the patient. Referral notes and results from other facilities and laboratories.",
    indirectCollectionGrounds: ["no_prejudice", "protect_interests"],
    recipients: "Referral facilities, laboratories, SHA, insurers (with consent)",
    retentionPeriod: "Per Ministry of Health records retention guidelines",
    securityMeasures: "EMR with individual logins and audit trail; paper files in restricted records room",
    systems: "Electronic medical records system",
    kenyaDataPurpose: "health_care",
    largeScale: true,
  },
  {
    ...base,
    id: "insurance-claims",
    sectors: ["health"],
    name: "Insurance and SHA claims",
    provision: "Only if you want your insurer or SHA to pay. Without it they won't, and you would pay the bill yourself.",
    purpose: "Submit claims for payment to SHA and private insurers.",
    lawfulBasis: "contract",
    dataSubjects: ["Patients"],
    dataCategories: ["Name", "Member number", "Diagnosis codes", "Treatment costs"],
    sensitiveCategories: ["Health status"],
    recipients: "SHA, private insurers",
    sensitiveDataGround: "obligations",
    sensitiveDataBasis: "The Social Health Insurance Act, 2023 and the patient's insurance cover: a claim must state the diagnosis and treatment to be paid.",
    healthDataCondition: "health_care_provider",
    sensitiveDataSafeguards: "Only the diagnosis codes and costs the payer asks for are sent. Claim files are kept apart from clinical notes, and only billing staff can open them.",
    retentionPeriod: "7 years",
    ...keep(7, "years", "the claim"),
    securityMeasures: "Claims submitted through insurer portals; access limited to billing staff",
    systems: "Billing system, insurer portals",
  },
  {
    ...base,
    id: "member-kyc",
    sectors: ["sacco", "fintech"],
    name: "Member / customer onboarding (KYC)",
    provision: "Yes. The law requires us to verify who you are, and we can't open an account without it.",
    purpose: "Verify identity and meet anti-money-laundering obligations before opening accounts.",
    lawfulBasis: "legal_obligation",
    dataSubjects: ["Members / customers", "Guarantors", "Nominees"],
    dataCategories: ["Name", "National ID number", "KRA PIN", "Photograph", "Address", "Phone number", "Income details"],
    sensitiveCategories: ["Biometric data", "Family details (children, parents, spouse)"],
    sensitiveDataGround: "obligations",
    sensitiveDataBasis:
      "The Proceeds of Crime and Anti-Money Laundering Act, 2009 and its regulations, which require customers to be identified and verified, and the nominee rules for members' deposits.",
    sensitiveDataSafeguards:
      "Fingerprints are held encrypted in the verification system only and never exported. Nominee and family details sit in the member file, which only member services can open.",
    indirectCollection: true,
    indirectSources: "Identity details confirmed against IPRS. Nominees' details, given by the member.",
    indirectCollectionGrounds: ["no_prejudice", "crime"],
    recipients: "SASRA / CBK on request, Financial Reporting Centre, IPRS verification",
    retentionPeriod: "7 years after the relationship ends (POCAMLA)",
    ...keep(7, "years", "the end of the relationship"),
    securityMeasures: "Core banking system with maker-checker; ID copies stored encrypted",
    systems: "Core banking / SACCO system",
    largeScale: true,
  },
  {
    ...base,
    id: "credit-scoring",
    sectors: ["sacco", "fintech"],
    name: "Loan appraisal and credit reporting",
    provision: "Yes. Without it we can't assess a loan application.",
    purpose: "Assess loan applications and share repayment data with credit reference bureaus.",
    lawfulBasis: "contract",
    dataSubjects: ["Borrowers", "Guarantors"],
    dataCategories: ["Name", "National ID number", "Loan history", "M-Pesa statements", "Credit score"],
    indirectCollection: true,
    indirectSources: "Credit reports from the credit reference bureaus.",
    indirectCollectionGrounds: ["consent"],
    indirectCollectionNotice:
      "The loan application form, which applicants and guarantors sign, says we'll get their credit reports from the credit reference bureaus and why.",
    recipients: "Credit reference bureaus (Metropol, TransUnion, Creditinfo)",
    retentionPeriod: "7 years after loan closure",
    ...keep(7, "years", "the loan closing"),
    securityMeasures: "Role-based access; CRB submissions over secure API",
    systems: "Loan management system",
    largeScale: true,
    systematicMonitoring: true,
  },
  {
    ...base,
    id: "customer-orders",
    sectors: ["retail", "hospitality"],
    name: "Customer orders and delivery",
    provision: "Yes for what we need to take payment and deliver your order. Without it we can't fulfil the order.",
    purpose: "Take orders, process payment, and deliver goods.",
    lawfulBasis: "contract",
    dataSubjects: ["Customers"],
    dataCategories: ["Name", "Phone number", "Delivery address", "Order history", "Payment reference"],
    recipients: "Delivery riders / courier, payment provider",
    retentionPeriod: "5 years (tax records)",
    ...keep(5, "years", "the sale"),
    securityMeasures: "POS / e-commerce platform access controls",
    systems: "POS, e-commerce platform",
  },
  {
    ...base,
    id: "loyalty",
    sectors: ["retail", "hospitality"],
    name: "Loyalty programme",
    purpose: "Run a points programme and reward repeat customers.",
    lawfulBasis: "consent",
    dataSubjects: ["Loyalty members"],
    dataCategories: ["Name", "Phone number", "Date of birth", "Purchase history"],
    recipients: "Loyalty platform provider",
    retentionPeriod: "Until membership ends plus 1 year",
    ...keep(1, "years", "the end of membership"),
    securityMeasures: "Access limited to marketing team",
    systems: "Loyalty platform",
  },
  {
    ...base,
    id: "guest-registration",
    sectors: ["hospitality"],
    name: "Guest registration",
    provision: "Yes. The law requires us to register guests, and we can't accommodate you without it.",
    purpose: "Register hotel guests as required by law and manage bookings.",
    lawfulBasis: "legal_obligation",
    dataSubjects: ["Guests"],
    dataCategories: ["Name", "ID / passport number", "Nationality", "Phone number", "Stay dates"],
    recipients: "Tourism Regulatory Authority / police on lawful request",
    retentionPeriod: "2 years",
    ...keep(2, "years", "the stay"),
    securityMeasures: "Guest register kept at reception, archived in locked store",
    systems: "Property management system",
  },
  {
    ...base,
    id: "visitor-log",
    sectors: "all",
    name: "Visitor log",
    provision: "Yes. Visitors who don't sign in may not be admitted.",
    purpose: "Record visitors to the premises for security.",
    lawfulBasis: "legitimate_interests",
    dataSubjects: ["Visitors"],
    dataCategories: ["Name", "ID number", "Phone number", "Time in / out"],
    recipients: "None",
    retentionPeriod: "6 months",
    ...keep(6, "months", "the visit"),
    securityMeasures: "Log kept at reception; ID numbers not shown to other visitors",
    systems: "Paper register / visitor app",
  },
];

export function templatesForSector(sector: Sector): ActivityTemplate[] {
  return ACTIVITY_TEMPLATES.filter((t) => t.sectors === "all" || t.sectors.includes(sector));
}
