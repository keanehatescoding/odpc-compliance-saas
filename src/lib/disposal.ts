import { daysBetween } from "./dates";

// The personal data an organisation has got rid of. Section 39 of the Data
// Protection Act, 2019 says personal data is kept only as long as reasonably
// necessary for its purpose, and is then deleted, erased, anonymised or
// pseudonymised. The RoPA says how long each activity keeps its data; a dated
// log of disposals is how an organisation shows it kept to that. Plain-language
// summary; check against current ODPC guidance before relying on it.

export const DISPOSAL_METHODS = {
  deleted: "Deleted from systems",
  shredded: "Shredded or destroyed",
  anonymised: "Anonymised",
  returned: "Returned or handed over",
  other: "Another way",
} as const;

export type DisposalMethod = keyof typeof DISPOSAL_METHODS;
export const DISPOSAL_METHOD_KEYS = Object.keys(DISPOSAL_METHODS) as DisposalMethod[];

export const DISPOSAL_REASONS = {
  retention: "Retention period ended",
  erasure: "Someone asked for erasure",
  consent_withdrawn: "Consent was withdrawn",
  purpose_ended: "No longer needed",
  other: "Another reason",
} as const;

export type DisposalReason = keyof typeof DISPOSAL_REASONS;
export const DISPOSAL_REASON_KEYS = Object.keys(DISPOSAL_REASONS) as DisposalReason[];

export interface DisposalLike {
  id: string;
  activityId: string | null;
  disposedOn: string;
  nextOn: string | null;
}

export type DisposalStatus = "done" | "next_due";

/** The date of the most recent disposal for each activity. */
export function latestByActivity(disposals: { activityId: string | null; disposedOn: string }[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const d of disposals) {
    if (d.activityId && d.disposedOn > (latest.get(d.activityId) ?? "")) latest.set(d.activityId, d.disposedOn);
  }
  return latest;
}

/** Whether a later disposal has been recorded for the same activity. */
export function followedUp(d: DisposalLike, latest: Map<string, string>): boolean {
  return d.activityId !== null && (latest.get(d.activityId) ?? "") > d.disposedOn;
}

/**
 * Where a disposal stands. The next round counts as due once its date arrives,
 * unless a later disposal for the same activity shows it has been done.
 */
export function disposalStatus(d: DisposalLike, latest: Map<string, string>, today: string): DisposalStatus {
  if (followedUp(d, latest)) return "done";
  return d.nextOn && d.nextOn <= today ? "next_due" : "done";
}

export const DISPOSAL_STATUS_LABEL: Record<DisposalStatus, string> = {
  done: "Done",
  next_due: "Next round due",
};

/** Days from today to the next round (negative once passed), or null when none is set. */
export function daysToNextDisposal(d: { nextOn: string | null }, today: string): number | null {
  return d.nextOn ? daysBetween(today, d.nextOn) : null;
}

/** What to check before and after getting rid of personal data, as a checklist for whoever carries it out. */
export const DISPOSAL_CHECKS = [
  "Every copy goes: backups, exports, email attachments, phones and paper, not only the main system",
  "Your processors delete or return their copies too, and confirm it in writing",
  "Nothing you still have to keep is included: records another law sets a longer period for, such as tax, or anything an open request, complaint or court case needs",
  "Paper is shredded or burned, not put out with the rubbish, and devices are wiped before they are sold or thrown away",
  "Anonymised data can't be traced back to a person, even combined with what else you hold",
  "You keep a note of what went, when, how and who approved it, and not a copy of the data itself",
] as const;

export interface DisposalGapInput {
  activityId: string | null;
  recordCount: number | null;
  authorisedBy: string;
  evidence: string;
}

/** What the record still needs before it's good evidence. */
export function disposalGaps(d: DisposalGapInput): string[] {
  const gaps: string[] = [];
  if (!d.activityId) gaps.push("Link the processing activity the data belonged to, so the disposal can be checked against its retention period.");
  if (d.recordCount === null) gaps.push("Record roughly how many records it covered.");
  if (!d.authorisedBy) gaps.push("Say who authorised it.");
  if (!d.evidence) gaps.push("Say where the proof is kept, such as a destruction certificate, a deletion log or a signed note.");
  return gaps;
}
