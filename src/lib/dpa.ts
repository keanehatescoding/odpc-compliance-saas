// Reference data from the Data Protection Act, 2019 (Kenya) and its 2021
// regulations. Anything a customer relies on for a legal decision should be
// checked by counsel; the wording here is a plain-language summary.

/** Lawful bases for processing, Data Protection Act 2019, s.30. */
export const LAWFUL_BASES = {
  consent: "Consent of the data subject",
  contract: "Performance of a contract with the data subject",
  legal_obligation: "Compliance with a legal obligation",
  vital_interests: "Protection of vital interests",
  public_interest: "Task carried out in the public interest",
  official_authority: "Exercise of official authority",
  legitimate_interests: "Legitimate interests of the controller or a third party",
  research: "Historical, statistical, journalistic, literary, artistic or scientific research",
} as const;

export type LawfulBasis = keyof typeof LAWFUL_BASES;
export const LAWFUL_BASIS_KEYS = Object.keys(LAWFUL_BASES) as LawfulBasis[];

/** Sensitive personal data as defined in s.2 of the Act. */
export const SENSITIVE_CATEGORIES = [
  "Race",
  "Health status",
  "Ethnic social origin",
  "Conscience",
  "Belief",
  "Genetic data",
  "Biometric data",
  "Property details",
  "Marital status",
  "Family details (children, parents, spouse)",
  "Sex or sexual orientation",
] as const;

/**
 * Size bands used by the ODPC fee schedule. The staff/turnover thresholds
 * that define each band are set in the Registration Regulations; confirm them
 * there rather than here.
 */
export const ORG_SIZES = {
  micro_small: "Micro or small enterprise",
  medium: "Medium enterprise",
  large: "Large enterprise",
} as const;

export type OrgSize = keyof typeof ORG_SIZES;
export const ORG_SIZE_KEYS = Object.keys(ORG_SIZES) as OrgSize[];

/**
 * Indicative ODPC fees in KSh (First Schedule, Registration Regulations 2021).
 * Shown as guidance only. Confirm against the ODPC's current schedule before
 * quoting to a customer.
 */
export const ODPC_FEES: Record<OrgSize, { registration: number; renewal: number }> = {
  micro_small: { registration: 4_000, renewal: 2_000 },
  medium: { registration: 16_000, renewal: 9_000 },
  large: { registration: 40_000, renewal: 25_000 },
};

export const SECTORS = {
  education: "Education (schools, colleges)",
  health: "Health (clinics, pharmacies, labs)",
  sacco: "SACCO / microfinance",
  fintech: "Fintech / digital lending",
  retail: "Retail / e-commerce",
  hospitality: "Hospitality (hotels, bars, restaurants)",
  other: "Other",
} as const;

export type Sector = keyof typeof SECTORS;
export const SECTOR_KEYS = Object.keys(SECTORS) as Sector[];

export const REGISTRATION_ROLES = {
  controller: "Data controller",
  processor: "Data processor",
} as const;

export type RegistrationRole = keyof typeof REGISTRATION_ROLES;

export function formatKsh(amount: number): string {
  return `KSh ${amount.toLocaleString("en-KE")}`;
}
