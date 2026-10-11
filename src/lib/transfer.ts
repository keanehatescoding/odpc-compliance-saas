import { daysBetween } from "./dates";

// A transfer of personal data out of Kenya: who receives it, where, and what
// makes it lawful. Section 48 of the Data Protection Act, 2019 allows a
// controller or processor to send personal data to another country only with
// proof of appropriate safeguards (which can be that the country's own data
// protection law is commensurate with Kenya's), or where the transfer is
// necessary for one of the reasons the section lists. The Data Protection
// (General) Regulations, 2021 add the person's explicit consent, given after
// being told the risks, where none of those applies. Section 49 says
// sensitive personal data leaves Kenya only with the person's consent and
// confirmed safeguards, and lets the Data Commissioner ask whoever transfers
// data to demonstrate that the safeguards work. Plain-language summary; check
// against current ODPC guidance before relying on it.

export const TRANSFER_BASES = {
  pending: "Not decided yet",
  adequacy: "The country's law protects personal data as Kenya's does",
  safeguards: "Appropriate safeguards, such as contract clauses",
  necessity: "Necessary for a reason the Act lists",
  consent: "The person's explicit consent",
} as const;

export type TransferBasis = keyof typeof TRANSFER_BASES;
export const TRANSFER_BASIS_KEYS = Object.keys(TRANSFER_BASES) as TransferBasis[];

/** What the record should say about the basis it gives. */
export const TRANSFER_BASIS_DETAIL: Record<Exclude<TransferBasis, "pending">, string> = {
  adequacy: "Name the country's data protection law or the decision that recognises it, and how you checked.",
  safeguards: "Say what the safeguards are: the contract clauses, binding corporate rules or other agreement that binds whoever receives the data.",
  necessity:
    "Say which reason applies and why the transfer is needed for it: a contract with the person or in their interest, the public interest, a legal claim, someone's vital interests, or a compelling legitimate interest of yours.",
  consent: "Say how people are asked, and what they are told about the risks of their data leaving Kenya.",
};

export interface TransferLike {
  countries: string;
  basis: string;
  basisDetail: string;
  reviewOn: string | null;
}

export type TransferStatus = "incomplete" | "review_due" | "in_place";

/**
 * Whether the record shows what the transfer relies on. It needs the
 * destination, a basis and what that basis rests on, and a review date that
 * has arrived counts as due.
 */
export function transferStatus(t: TransferLike, today: string): TransferStatus {
  if (!t.countries || t.basis === "pending" || !t.basisDetail) return "incomplete";
  return t.reviewOn && t.reviewOn <= today ? "review_due" : "in_place";
}

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  incomplete: "Not finished",
  review_due: "Review due",
  in_place: "In place",
};

/** Days from today to the review (negative once passed), or null when none is set. */
export function daysToTransferReview(t: TransferLike, today: string): number | null {
  return t.reviewOn ? daysBetween(today, t.reviewOn) : null;
}

/** What a transfer record should show, as a checklist for whoever writes or reviews one. */
export const TRANSFER_TEST = [
  "Who receives the data and in which countries, including where a cloud or software supplier stores it and where its support staff reach it from",
  "Only the data the recipient needs is sent",
  "The basis: the country's law protects personal data as Kenya's does, appropriate safeguards bind the recipient, the transfer is necessary for a reason section 48 lists, or the person explicitly consented after being told the risks",
  "Safeguards are in writing and bind the recipient: what it may do with the data, how it secures it, who it may pass it on to, and that it tells you of a breach",
  "Sensitive personal data, such as health, biometric or family details, leaves Kenya only with the person's consent as well (section 49)",
  "You can produce the proof. The Data Commissioner can ask you to show the safeguards work, and can suspend or stop a transfer",
  "The privacy notice tells people their data goes abroad and how it is protected",
] as const;

export interface TransferGapInput {
  countries: string;
  dataSent: string;
  basis: string;
  basisDetail: string;
  subjectConsent: string;
  evidence: string;
}

export interface TransferActivity {
  name: string;
  crossBorder: boolean;
  sensitiveCategories: string[];
}

/** Whether sensitive personal data is going abroad without the consent section 49 asks for. */
export function needsSubjectConsent(t: { subjectConsent: string }, activity: { sensitiveCategories: string[] } | null | undefined): boolean {
  return !!activity && activity.sensitiveCategories.length > 0 && !t.subjectConsent;
}

/**
 * What the record still needs before it shows the transfer is lawful.
 * `activity` is the RoPA activity it is for, or null when there is none.
 */
export function transferGaps(t: TransferGapInput, activity: TransferActivity | null): string[] {
  const gaps: string[] = [];
  if (!t.countries) gaps.push("Say which country or countries the data goes to.");
  if (!t.dataSent) gaps.push("Say what personal data is sent.");
  if (t.basis === "pending") {
    gaps.push("Record what the transfer relies on. Section 48 of the Act allows one only with appropriate safeguards or where it is necessary.");
  } else {
    if (!t.basisDetail) gaps.push(TRANSFER_BASIS_DETAIL[t.basis as Exclude<TransferBasis, "pending">] ?? "Say what the basis rests on.");
    if (!t.evidence) {
      gaps.push("Say where the proof is kept, such as the signed agreement. The Data Commissioner can ask you to demonstrate the safeguards (section 49).");
    }
  }
  if (!activity) {
    gaps.push("Link the processing activity this transfer is part of.");
  } else {
    if (needsSubjectConsent(t, activity)) {
      gaps.push(
        `${activity.name} involves sensitive personal data (${activity.sensitiveCategories.join(", ")}). Section 49 of the Act lets it leave Kenya only with the person's consent: record how you get it.`,
      );
    }
    if (!activity.crossBorder) {
      gaps.push(`Your RoPA doesn't say ${activity.name} sends data outside Kenya. Update whichever is wrong.`);
    }
  }
  return gaps;
}

/** The activities that send data outside Kenya but have no transfer record behind them. */
export function activitiesWithoutTransfer<A extends { id: string; crossBorder: boolean }>(activities: A[], transfers: { activityId: string | null }[]): A[] {
  const covered = new Set(transfers.map((t) => t.activityId));
  return activities.filter((a) => a.crossBorder && !covered.has(a.id));
}
