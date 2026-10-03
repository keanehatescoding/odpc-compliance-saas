import { addMonths, daysBetween } from "./dates";
import { LAWFUL_BASES, type LawfulBasis, type Sector } from "./dpa";
import type { ActivityInput } from "./ropa";

// Data Protection Impact Assessments under s.31 of the Data Protection Act,
// 2019. A DPIA must describe the processing and its purposes, assess whether
// it is necessary and proportionate, assess the risks to data subjects, and
// set out the measures that address them. Plain-language summary; check
// against the Act, the General Regulations and the ODPC's DPIA guidance.

// ---------------------------------------------------------------------------
// Risk scoring: likelihood × severity on a 3×3 grid.
// ---------------------------------------------------------------------------

export const LIKELIHOODS = {
  remote: "Remote",
  possible: "Possible",
  probable: "Probable",
} as const;

export const SEVERITIES = {
  minimal: "Minimal",
  significant: "Significant",
  severe: "Severe",
} as const;

export type Likelihood = keyof typeof LIKELIHOODS;
export type Severity = keyof typeof SEVERITIES;
export const LIKELIHOOD_KEYS = Object.keys(LIKELIHOODS) as Likelihood[];
export const SEVERITY_KEYS = Object.keys(SEVERITIES) as Severity[];

export type RiskLevel = "low" | "medium" | "high";

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = { low: "Low", medium: "Medium", high: "High" };

const SCORE = { remote: 1, possible: 2, probable: 3, minimal: 1, significant: 2, severe: 3 } as const;

export function riskLevel(likelihood: Likelihood | string, severity: Severity | string): RiskLevel {
  const score = (SCORE[likelihood as Likelihood] ?? 1) * (SCORE[severity as Severity] ?? 1);
  return score >= 6 ? "high" : score >= 3 ? "medium" : "low";
}

const LEVEL_ORDER: RiskLevel[] = ["low", "medium", "high"];

export function highestLevel(levels: RiskLevel[]): RiskLevel | null {
  if (levels.length === 0) return null;
  return levels.reduce((a, b) => (LEVEL_ORDER.indexOf(b) > LEVEL_ORDER.indexOf(a) ? b : a));
}

export interface RiskInput {
  description: string;
  likelihood: Likelihood;
  severity: Severity;
  mitigation: string;
  residualLikelihood: Likelihood;
  residualSeverity: Severity;
}

/**
 * Risk table fields arrive as parallel arrays, one entry per table row. Every row has the
 * same six fields (textareas and selects always submit), so index i lines up.
 */
export const RISK_FIELDS = {
  description: "riskDescription",
  likelihood: "riskLikelihood",
  severity: "riskSeverity",
  mitigation: "riskMitigation",
  residualLikelihood: "riskResidualLikelihood",
  residualSeverity: "riskResidualSeverity",
} as const satisfies Record<keyof RiskInput, string>;

/** Form key for errors on risk row `i`. */
export const riskErrorKey = (i: number) => `risk-${i}`;

type Residual = { residualLikelihood: Likelihood | string; residualSeverity: Severity | string };

export function residualLevel(r: Residual): RiskLevel {
  return riskLevel(r.residualLikelihood, r.residualSeverity);
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Months after approval at which a DPIA should be reviewed, unless set otherwise. */
export const REVIEW_AFTER_MONTHS = 12;

export function defaultReviewDate(approvedOn: string): string {
  return addMonths(approvedOn, REVIEW_AFTER_MONTHS);
}

export interface DpiaLike {
  approvedOn: string | null;
  reviewOn: string | null;
}

export type DpiaStatus = "draft" | "approved" | "review_due";

export const DPIA_STATUS_LABEL: Record<DpiaStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  review_due: "Review due",
};

export function dpiaStatus(d: DpiaLike, today: string): DpiaStatus {
  if (!d.approvedOn) return "draft";
  if (d.reviewOn && daysBetween(today, d.reviewOn) <= 0) return "review_due";
  return "approved";
}

/**
 * Prior consultation: s.31 requires consulting the Data Commissioner before
 * processing when the DPIA shows high risk that the controller's measures do
 * not bring down.
 */
export function consultationRequired(risks: Residual[]): boolean {
  return risks.some((r) => residualLevel(r) === "high");
}

export interface ApprovalInput {
  description: string;
  necessity: string;
  approvedBy: string;
  odpcConsultedOn: string | null;
  risks: RiskInput[];
}

/** What still stops a DPIA from being signed off. Empty when it can be approved. */
export function approvalBlockers(d: ApprovalInput): string[] {
  const out: string[] = [];
  if (!d.description.trim()) out.push("Describe the processing.");
  if (!d.necessity.trim()) out.push("Explain why the processing is necessary and proportionate.");
  if (d.risks.length === 0) out.push("Identify at least one risk to the people whose data you process.");
  if (d.risks.some((r) => !r.mitigation.trim())) out.push("Record the measures that address each risk.");
  if (!d.approvedBy.trim()) out.push("Record who approved the DPIA.");
  if (consultationRequired(d.risks) && !d.odpcConsultedOn)
    out.push("A risk is still high after mitigation. Consult the ODPC and record the date before approving.");
  return out;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface DpiaTemplate {
  id: string;
  name: string;
  sectors: Sector[] | "all";
  /** The RoPA template this DPIA goes with, so it is suggested automatically. */
  activityTemplateId?: string;
  description: string;
  purposes: string;
  necessity: string;
  risks: RiskInput[];
}

const risk = (
  description: string,
  [likelihood, severity]: [Likelihood, Severity],
  mitigation: string,
  [residualLikelihood, residualSeverity]: [Likelihood, Severity],
): RiskInput => ({ description, likelihood, severity, mitigation, residualLikelihood, residualSeverity });

/**
 * Starter DPIAs for common high-risk processing. Like the RoPA templates, they
 * are a starting point: the organisation edits them to match what it does.
 */
export const DPIA_TEMPLATES: DpiaTemplate[] = [
  {
    id: "cctv",
    name: "CCTV surveillance",
    sectors: "all",
    activityTemplateId: "cctv",
    description:
      "Cameras record video of entrances, corridors, car parks and other shared areas 24 hours a day. Footage is stored on a recorder on site and overwritten automatically. Staff, visitors and customers are recorded whenever they are in view.",
    purposes:
      "Deter theft and violence, protect staff, visitors and property, and provide evidence when an incident is investigated.",
    necessity:
      "Lawful basis: legitimate interests in keeping people and property safe. Cameras are limited to areas where incidents have happened or are likely, and do not cover toilets, changing rooms, staff rest areas or neighbouring property. Audio is not recorded. Signs at each entrance say that CCTV is in use, why, and who to contact. We considered better lighting and more guards; they help but do not provide evidence after an incident.",
    risks: [
      risk(
        "People are recorded in places where they expect privacy, or more than is needed for security.",
        ["possible", "significant"],
        "Camera positions reviewed and documented; privacy masking on views of private areas; no cameras in toilets, changing or rest areas.",
        ["remote", "significant"],
      ),
      risk(
        "People do not know they are being recorded or how to ask for footage of themselves.",
        ["probable", "minimal"],
        "Signs at every entrance naming the organisation and a contact; CCTV covered in the privacy notice; access requests handled by a named person.",
        ["remote", "minimal"],
      ),
      risk(
        "Footage is viewed, copied or shared by staff without a valid reason, e.g. posted on social media.",
        ["possible", "severe"],
        "Viewing limited to the security lead; recorder in a locked room with a password; export only with a logged reason; staff told that misuse is a disciplinary matter.",
        ["remote", "significant"],
      ),
      risk(
        "Footage is kept longer than needed.",
        ["possible", "minimal"],
        "Recorder overwrites after 30 days; clips kept for an investigation are logged and deleted when it closes.",
        ["remote", "minimal"],
      ),
    ],
  },
  {
    id: "student-records",
    name: "Student records",
    sectors: ["education"],
    activityTemplateId: "student-records",
    description:
      "The school collects and keeps records on every student from admission to graduation: identity details, photographs, birth certificate numbers, parent contacts, academic results, health information (allergies, conditions, medication) and family circumstances. Records are held in the school management system and in paper files, and are shared with the Ministry of Education (NEMIS/KEMIS) and examination bodies.",
    purposes:
      "Admit and teach students, keep them safe (including health needs), report to the Ministry and examination bodies as the law requires, and communicate with parents and guardians.",
    necessity:
      "Lawful basis: legal obligation (Basic Education Act reporting) and, for health information, the student's vital interests. Admission forms collect only what the school uses; optional fields are marked. Parents can see and correct their child's record through the class teacher. Records are kept for the period of enrolment plus 7 years; transcripts permanently. Parental consent is obtained for photographs used in publicity.",
    risks: [
      risk(
        "Health or family information about a child is seen by staff who do not need it, causing stigma or bullying.",
        ["possible", "severe"],
        "Role-based access in the school management system; health details visible only to the nurse, class teacher and head; paper files in locked cabinets.",
        ["remote", "significant"],
      ),
      risk(
        "Children's photographs or personal details are published (website, social media, WhatsApp groups) without parental consent.",
        ["probable", "significant"],
        "Photo consent recorded at admission and checked before any publication; no full names with photos; staff guidance on class WhatsApp groups.",
        ["remote", "significant"],
      ),
      risk(
        "Student records are lost or exposed through a breach of the school management system or shared logins.",
        ["possible", "severe"],
        "Individual logins with strong passwords; accounts removed when staff leave; vendor contract with data protection clauses; regular backups.",
        ["remote", "significant"],
      ),
      risk(
        "Parents and older students do not understand how their data is used or how to exercise their rights.",
        ["possible", "minimal"],
        "Plain-language privacy notice in the admission pack and on the website; named contact for requests.",
        ["remote", "minimal"],
      ),
    ],
  },
  {
    id: "patient-records",
    name: "Patient medical records",
    sectors: ["health"],
    activityTemplateId: "patient-records",
    description:
      "The facility records each patient's identity, contact details, clinical history, diagnoses, lab results and prescriptions in an electronic medical records (EMR) system, with some paper files. Records are shared with referral facilities, laboratories, SHA and insurers.",
    purposes: "Diagnose and treat patients, keep continuity of care, and claim payment from SHA and insurers.",
    necessity:
      "Lawful basis: the patient's vital interests and, for health data, processing by a health professional under a duty of confidentiality (s.46). Only data needed for care or claims is recorded. Patients can see and correct their records. Retention follows Ministry of Health records guidelines. Insurers receive only what a claim requires.",
    risks: [
      risk(
        "Staff look up records of patients they are not treating (relatives, neighbours, public figures).",
        ["probable", "severe"],
        "Individual EMR logins; access audit trail reviewed monthly; confidentiality undertaking signed by all staff; disciplinary policy.",
        ["possible", "significant"],
      ),
      risk(
        "Records are exposed through ransomware, a hacked EMR or a lost device.",
        ["possible", "severe"],
        "EMR vendor contract with security and breach-notification clauses; offline backups tested quarterly; device encryption; staff phishing awareness.",
        ["remote", "severe"],
      ),
      risk(
        "Diagnoses are disclosed to insurers or employers beyond what the patient agreed to.",
        ["possible", "significant"],
        "Claims limited to required codes; written patient consent for disclosure to employers; disclosures logged.",
        ["remote", "significant"],
      ),
      risk(
        "Inaccurate or mixed-up records lead to wrong treatment.",
        ["remote", "severe"],
        "Patient identity checked at each visit with two identifiers; corrections recorded with an audit trail.",
        ["remote", "significant"],
      ),
    ],
  },
  {
    id: "member-kyc",
    name: "Customer onboarding with ID and biometrics",
    sectors: ["sacco", "fintech"],
    activityTemplateId: "member-kyc",
    description:
      "New members or customers provide their national ID, KRA PIN, photograph, address, income details and, where used, fingerprints or a selfie for identity verification. Details are checked against IPRS and stored in the core banking system.",
    purposes: "Verify identity before opening an account and meet anti-money-laundering obligations (POCAMLA).",
    necessity:
      "Lawful basis: legal obligation under POCAMLA and SASRA/CBK rules. Biometrics are used only for identity verification, not for other purposes. Customers are told what is collected and why at onboarding. Records are kept 7 years after the relationship ends, as the law requires, then deleted.",
    risks: [
      risk(
        "ID copies and biometric data are stolen and used for identity fraud or SIM swap.",
        ["possible", "severe"],
        "ID images and biometric templates encrypted at rest; access limited to onboarding and compliance staff; maker-checker on account changes.",
        ["remote", "severe"],
      ),
      risk(
        "Biometric data is reused for purposes the customer was not told about, such as staff attendance or marketing.",
        ["remote", "significant"],
        "Biometric use limited to verification in policy and in system permissions; any new use goes through a fresh DPIA.",
        ["remote", "minimal"],
      ),
      risk(
        "A wrong match or failed verification locks out a genuine customer.",
        ["possible", "significant"],
        "Manual review route when automated checks fail; customer can ask for a human decision.",
        ["remote", "significant"],
      ),
      risk(
        "Records are kept after the retention period ends.",
        ["probable", "minimal"],
        "Annual deletion run for closed accounts past 7 years, logged.",
        ["remote", "minimal"],
      ),
    ],
  },
  {
    id: "credit-scoring",
    name: "Credit scoring and digital lending",
    sectors: ["sacco", "fintech"],
    activityTemplateId: "credit-scoring",
    description:
      "Loan applications are scored using the applicant's repayment history, M-Pesa statements, CRB data and, for app-based lending, device data. The score decides whether a loan is approved and its limit. Repayment data is shared with credit reference bureaus.",
    purposes: "Assess affordability and credit risk, set loan limits, and report repayment as CBK/SASRA rules require.",
    necessity:
      "Lawful basis: performance of the loan contract and legal obligation for CRB reporting. Only financial data relevant to affordability is used; phone contacts, photos and social media are not accessed. Applicants are told that automated scoring is used and can ask for a human to review a decline (s.35).",
    risks: [
      risk(
        "Automated scoring declines or limits people unfairly, with no explanation or way to challenge it.",
        ["probable", "significant"],
        "Reasons given with each decline; human review on request; scoring model reviewed for bias at least yearly.",
        ["possible", "minimal"],
      ),
      risk(
        "Borrowers' contacts are used for debt collection or shaming (a practice the ODPC has fined lenders for).",
        ["possible", "severe"],
        "App does not request contacts permission; collections policy bans contacting third parties; collection agents bound by contract.",
        ["remote", "severe"],
      ),
      risk(
        "Inaccurate data is reported to a CRB, harming the person's ability to borrow.",
        ["possible", "significant"],
        "Data reconciled before each CRB submission; 30-day notice before negative listing; disputes handled within 14 days.",
        ["remote", "significant"],
      ),
      risk(
        "Financial data is exposed in a breach of the loan system or a third-party integration.",
        ["possible", "severe"],
        "API keys rotated and scoped; vendor security review; encryption in transit and at rest.",
        ["remote", "significant"],
      ),
    ],
  },
  {
    id: "marketing",
    name: "Marketing with an overseas provider",
    sectors: ["retail", "hospitality", "fintech", "sacco", "other"],
    activityTemplateId: "marketing",
    description:
      "Customers who opt in receive promotions by SMS, WhatsApp and email. Contact details and purchase history are held in a CRM and passed to bulk SMS and email providers, at least one of which stores data outside Kenya.",
    purposes: "Tell customers about offers and updates they have asked to receive.",
    necessity:
      "Lawful basis: consent, collected separately from the terms of sale, with a record of when and how it was given. Every message includes an opt-out. Only name, contact and purchase history are used; no sensitive data. Transfers outside Kenya rely on contractual safeguards with the provider (s.48–50).",
    risks: [
      risk(
        "Messages go to people who did not consent or who opted out.",
        ["probable", "minimal"],
        "Consent recorded with date and channel; opt-outs synced to all providers within 48 hours; lists not bought or rented.",
        ["remote", "minimal"],
      ),
      risk(
        "The overseas provider stores data in a country without adequate protection, or uses it for its own purposes.",
        ["possible", "significant"],
        "Provider contract restricts use to our instructions and requires breach notification; provider's location and safeguards recorded; transfer recorded in the RoPA.",
        ["remote", "significant"],
      ),
      risk(
        "Profiling from purchase history reveals sensitive information (e.g. health products, baby items).",
        ["remote", "significant"],
        "Segments based on product category exclude health and sensitive categories.",
        ["remote", "minimal"],
      ),
    ],
  },
  {
    id: "biometric-attendance",
    name: "Biometric staff attendance",
    sectors: "all",
    description:
      "Staff clock in and out with a fingerprint or face scanner. The device stores a biometric template and attendance times, which sync to the HR or payroll system.",
    purposes: "Record working hours accurately for payroll and stop buddy-punching.",
    necessity:
      "Biometric data is sensitive personal data, so a less intrusive option must be considered first. Staff are offered a card or PIN alternative and are not penalised for choosing it. Templates are stored, not fingerprint images, and are deleted when a staff member leaves. Attendance data is used only for payroll and attendance, not covert performance monitoring.",
    risks: [
      risk(
        "Staff feel they cannot refuse, so consent is not freely given.",
        ["probable", "significant"],
        "Card or PIN alternative offered in writing; choice recorded; no consequences for opting out.",
        ["remote", "minimal"],
      ),
      risk(
        "Biometric templates are stolen from the device or vendor cloud.",
        ["possible", "severe"],
        "Device stores templates only, encrypted; vendor contract and data location checked; admin access restricted.",
        ["remote", "significant"],
      ),
      risk(
        "Attendance data is used for purposes staff were not told about, such as disciplinary monitoring of breaks.",
        ["possible", "significant"],
        "Use limited to payroll and attendance in the staff privacy notice; reports restricted to HR.",
        ["remote", "minimal"],
      ),
      risk(
        "Templates are kept after staff leave.",
        ["probable", "minimal"],
        "Removal from the device is part of the exit checklist; quarterly reconciliation against the staff list.",
        ["remote", "minimal"],
      ),
    ],
  },
];

export function getDpiaTemplate(id: string | null | undefined): DpiaTemplate | undefined {
  return id ? DPIA_TEMPLATES.find((t) => t.id === id) : undefined;
}

export function dpiaTemplatesForSector(sector: Sector): DpiaTemplate[] {
  return DPIA_TEMPLATES.filter((t) => t.sectors === "all" || t.sectors.includes(sector));
}

// ---------------------------------------------------------------------------
// Drafting a DPIA from a RoPA entry
// ---------------------------------------------------------------------------

export interface DpiaDraft {
  title: string;
  templateId: string | null;
  description: string;
  purposes: string;
  necessity: string;
  risks: RiskInput[];
}

/** A RoPA entry as stored (the lawful basis comes back from the database as a plain string). */
type ActivityForDraft = Omit<ActivityInput, "lawfulBasis"> & { lawfulBasis: LawfulBasis | string; templateId?: string | null };

/** Starting risks for an activity with no matching template, based on its screening flags. */
export function screeningRisks(a: ActivityForDraft): RiskInput[] {
  const out: RiskInput[] = [];
  if (a.systematicMonitoring)
    out.push(
      risk(
        "Monitoring is more intrusive than needed, or people do not know they are being monitored.",
        ["possible", "significant"],
        "",
        ["possible", "significant"],
      ),
    );
  if (a.sensitiveCategories.length > 0)
    out.push(
      risk(
        `Sensitive data (${a.sensitiveCategories.join(", ").toLowerCase()}) is accessed or disclosed without authority, causing discrimination or distress.`,
        ["possible", a.largeScale ? "severe" : "significant"],
        "",
        ["possible", a.largeScale ? "severe" : "significant"],
      ),
    );
  if (a.involvesChildren)
    out.push(
      risk(
        "Children's data is used or shared in ways they or their parents would not expect.",
        ["possible", "significant"],
        "",
        ["possible", "significant"],
      ),
    );
  if (a.crossBorder)
    out.push(
      risk(
        `Data transferred outside Kenya${a.transferCountries ? ` (${a.transferCountries})` : ""} lacks adequate protection, or the recipient uses it for its own purposes.`,
        ["possible", "significant"],
        "",
        ["possible", "significant"],
      ),
    );
  if (a.largeScale)
    out.push(
      risk("A single breach exposes the data of many people at once.", ["possible", "severe"], "", [
        "possible",
        "severe",
      ]),
    );
  out.push(
    risk("Data is kept longer than needed for the purpose.", ["possible", "minimal"], "", ["possible", "minimal"]),
  );
  return out;
}

/** The facts already in the RoPA entry, as a starting description of the processing. */
export function describeActivity(a: ActivityForDraft): string {
  return [
    a.dataSubjects.length > 0 && `Whose data: ${a.dataSubjects.join(", ")}.`,
    a.dataCategories.length > 0 && `What data: ${a.dataCategories.join(", ")}.`,
    a.sensitiveCategories.length > 0 && `Sensitive data: ${a.sensitiveCategories.join(", ")}.`,
    a.systems && `Where it is held: ${a.systems}.`,
    a.recipients && `Shared with: ${a.recipients}.`,
    a.crossBorder && `Transferred outside Kenya: ${a.transferCountries}.`,
    a.retentionPeriod && `Kept for: ${a.retentionPeriod}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The first version of a DPIA. Uses the matching sector template when the
 * activity came from one (or one is chosen), and otherwise starts from the
 * RoPA entry and its screening flags. With no activity, a template or blank.
 */
export function draftDpia(activity: ActivityForDraft | null, template: DpiaTemplate | undefined): DpiaDraft {
  const t =
    template ?? (activity?.templateId ? DPIA_TEMPLATES.find((x) => x.activityTemplateId === activity.templateId) : undefined);
  if (!activity) {
    return {
      title: t?.name ?? "New processing",
      templateId: t?.id ?? null,
      description: t?.description ?? "",
      purposes: t?.purposes ?? "",
      necessity: t?.necessity ?? "",
      risks: t?.risks ?? [],
    };
  }
  const facts = describeActivity(activity);
  return {
    title: activity.name,
    templateId: t?.id ?? null,
    description: t ? `${t.description}\n\n${facts}` : facts,
    purposes: activity.purpose,
    necessity: t?.necessity ?? `Lawful basis: ${LAWFUL_BASES[activity.lawfulBasis as LawfulBasis] ?? activity.lawfulBasis}.`,
    risks: t?.risks ?? screeningRisks(activity),
  };
}
