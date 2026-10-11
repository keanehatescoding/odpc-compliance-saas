import { daysBetween } from "./dates";

// The data protection training an organisation's staff have had. The Data
// Protection Act, 2019 doesn't prescribe training in so many words: s.41 asks
// for appropriate organisational measures, and s.24(7) makes building staff
// capacity one of a data protection officer's duties. A dated log of sessions
// is how an organisation shows it has done that. Plain-language summary; check
// against current ODPC guidance before relying on it.

/** Refreshers are suggested this long after a session. A common choice, not a rule. */
export const REFRESHER_MONTHS = 12;

export interface TrainingLike {
  id: string;
  refresherOn: string | null;
  refreshesId: string | null;
}

export type TrainingStatus = "current" | "refresher_due" | "refreshed";

/** The sessions a later one was recorded as the refresher for. */
export function refreshedIds(sessions: { refreshesId: string | null }[]): Set<string> {
  return new Set(sessions.map((s) => s.refreshesId).filter((id) => id !== null));
}

/**
 * Where a session stands. One a later session refreshed is done with, whatever
 * its date says; otherwise a refresher date that has arrived counts as due.
 */
export function trainingStatus(s: TrainingLike, refreshed: Set<string>, today: string): TrainingStatus {
  if (refreshed.has(s.id)) return "refreshed";
  return s.refresherOn && s.refresherOn <= today ? "refresher_due" : "current";
}

export const TRAINING_STATUS_LABEL: Record<TrainingStatus, string> = {
  current: "Up to date",
  refresher_due: "Refresher due",
  refreshed: "Refresher held",
};

/** Days from today to the refresher (negative once passed), or null when none is set. */
export function daysToRefresher(s: { refresherOn: string | null }, today: string): number | null {
  return s.refresherOn ? daysBetween(today, s.refresherOn) : null;
}

/** What staff who handle personal data should come away knowing, as a checklist for whoever plans a session. */
export const TRAINING_TOPICS = [
  "What personal data and sensitive personal data are, with examples from your own work",
  "The principles: collect only what you need, use it for the purpose you gave, keep it accurate and no longer than necessary",
  "Keeping it secure day to day: passwords, shared devices, paper files, WhatsApp and personal email",
  "Spotting a breach and reporting it inside the organisation at once, because the 72 hours start when anyone learns of it",
  "Recognising a request from someone about their data, and who to pass it to",
  "Not sharing personal data with outsiders, including suppliers, without checking first",
] as const;

export interface TrainingGapInput {
  attendeeCount: number | null;
  evidence: string;
  refresherOn: string | null;
}

/** What the record still needs before it's good evidence. `refreshed` is whether a later session followed it up. */
export function trainingGaps(s: TrainingGapInput, refreshed: boolean): string[] {
  const gaps: string[] = [];
  if (s.attendeeCount === null) gaps.push("Record how many people attended.");
  if (!s.evidence) gaps.push("Say where the attendance register or certificates are kept, so you can show them if asked.");
  if (!s.refresherOn && !refreshed) gaps.push("Set a date for the refresher. Once a year is a common choice.");
  return gaps;
}
