import { z } from "zod";
import { LAWFUL_BASES, LAWFUL_BASIS_KEYS, SENSITIVE_CATEGORIES, type LawfulBasis, type Sector } from "./dpa";

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
  recipients: string;
  crossBorder: boolean;
  transferCountries: string;
  transferSafeguards: string;
  retentionPeriod: string;
  securityMeasures: string;
  systems: string;
  owner: string;
  largeScale: boolean;
  systematicMonitoring: boolean;
  involvesChildren: boolean;
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
    recipients: z.string().trim().max(2000).default(""),
    crossBorder: checkbox,
    transferCountries: z.string().trim().max(500).default(""),
    transferSafeguards: z.string().trim().max(2000).default(""),
    retentionPeriod: z.string().trim().min(1, { error: "State how long you keep the data." }).max(500),
    securityMeasures: z.string().trim().max(2000).default(""),
    systems: z.string().trim().max(500).default(""),
    owner: z.string().trim().max(200).default(""),
    largeScale: checkbox,
    systematicMonitoring: checkbox,
    involvesChildren: checkbox,
  })
  .refine((v) => !v.crossBorder || v.transferCountries !== "", {
    path: ["transferCountries"],
    error: "Name the countries data is transferred to.",
    // Run even when unrelated fields fail, so every error shows on the first submit.
    when: ({ issues }) => !issues.some((i) => ["crossBorder", "transferCountries"].includes(String(i.path?.[0]))),
  });

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
    recipients: get("recipients"),
    crossBorder: get("crossBorder"),
    transferCountries: get("transferCountries"),
    transferSafeguards: get("transferSafeguards"),
    retentionPeriod: get("retentionPeriod"),
    securityMeasures: get("securityMeasures"),
    systems: get("systems"),
    owner: get("owner"),
    largeScale: get("largeScale"),
    systematicMonitoring: get("systematicMonitoring"),
    involvesChildren: get("involvesChildren"),
  });
}

// ---------------------------------------------------------------------------
// DPIA screening
// ---------------------------------------------------------------------------

type DpiaInput = Pick<
  ActivityInput,
  "sensitiveCategories" | "crossBorder" | "largeScale" | "systematicMonitoring" | "involvesChildren"
>;

/**
 * Reasons an activity is likely to need a Data Protection Impact Assessment
 * (s.31 of the Act: processing "likely to result in high risk"). This is a
 * screening aid, not a legal determination.
 */
export function dpiaTriggers(a: DpiaInput): string[] {
  const reasons: string[] = [];
  if (a.systematicMonitoring) reasons.push("Systematic monitoring (e.g. CCTV, location or behaviour tracking)");
  if (a.sensitiveCategories.length > 0 && a.largeScale) reasons.push("Large-scale processing of sensitive personal data");
  else if (a.sensitiveCategories.length > 0) reasons.push("Processing of sensitive personal data");
  if (a.involvesChildren) reasons.push("Processing of children's data");
  if (a.crossBorder) reasons.push("Transfer of personal data outside Kenya");
  return reasons;
}

/** Two or more triggers, or systematic monitoring alone, means a DPIA is recommended. */
export function dpiaRecommended(a: DpiaInput): boolean {
  const reasons = dpiaTriggers(a);
  return reasons.length >= 2 || a.systematicMonitoring;
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
  { header: "Recipients", value: (a) => a.recipients },
  {
    header: "Transfers outside Kenya",
    value: (a) => (a.crossBorder ? `Yes: ${a.transferCountries}` : "No"),
  },
  { header: "Transfer safeguards", value: (a) => (a.crossBorder ? a.transferSafeguards : "") },
  { header: "Retention period", value: (a) => a.retentionPeriod },
  { header: "Security measures", value: (a) => a.securityMeasures },
  { header: "Systems / location", value: (a) => a.systems },
  { header: "Owner", value: (a) => a.owner },
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
  crossBorder: false,
  transferCountries: "",
  transferSafeguards: "",
  largeScale: false,
  systematicMonitoring: false,
  involvesChildren: false,
  owner: "",
} satisfies Partial<ActivityInput>;

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
    recipients: "KRA, NSSF, SHA, payroll provider, bank",
    retentionPeriod: "7 years after employment ends",
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
    recipients: "Security contractor; police on lawful request",
    retentionPeriod: "30 days unless needed for an investigation",
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
    securityMeasures: "Opt-out on every message; unsubscribe list honoured",
    systems: "CRM, bulk SMS platform",
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
    recipients: "Ministry of Education, KNEC, examination bodies",
    retentionPeriod: "Duration of enrolment plus 7 years; academic transcripts permanently",
    securityMeasures: "School management system with role-based access; paper files in locked cabinets",
    systems: "School management system, NEMIS",
    involvesChildren: true,
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
    recipients: "Bank, M-Pesa (Safaricom), auditors",
    retentionPeriod: "7 years (tax and audit requirements)",
    securityMeasures: "Finance office access only",
    systems: "Accounting software",
    involvesChildren: true,
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
    recipients: "Referral facilities, laboratories, SHA, insurers (with consent)",
    retentionPeriod: "Per Ministry of Health records retention guidelines",
    securityMeasures: "EMR with individual logins and audit trail; paper files in restricted records room",
    systems: "Electronic medical records system",
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
    retentionPeriod: "7 years",
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
    recipients: "SASRA / CBK on request, Financial Reporting Centre, IPRS verification",
    retentionPeriod: "7 years after the relationship ends (POCAMLA)",
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
    recipients: "Credit reference bureaus (Metropol, TransUnion, Creditinfo)",
    retentionPeriod: "7 years after loan closure",
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
    securityMeasures: "Log kept at reception; ID numbers not shown to other visitors",
    systems: "Paper register / visitor app",
  },
];

export function templatesForSector(sector: Sector): ActivityTemplate[] {
  return ACTIVITY_TEMPLATES.filter((t) => t.sectors === "all" || t.sectors.includes(sector));
}
