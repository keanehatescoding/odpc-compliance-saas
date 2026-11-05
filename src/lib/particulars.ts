import { addDays, daysBetween } from "./dates";
import { formatDaysLeft } from "./subject-request";

// Changes to the particulars an organisation registered with the ODPC.
// Regulation 15(1) of the Data Protection (Registration of Data Controllers and
// Data Processors) Regulations, 2021: "Subject to section 19(2) of the Act, a
// data controller or data processor shall, within fourteen days of the
// occurrence of any changes in the particulars … notify the Data Commissioner
// in writing." Not doing so is an offence (reg. 15(4)), punishable under s.73
// of the Act. Plain-language summary; check against the Regulations and current
// ODPC guidance before relying on it.

/** Days from the change to notify the Data Commissioner (reg. 15(1)). */
export const NOTIFY_DAYS = 14;

/** Within this many days of the deadline a change counts as due soon. */
export const DUE_SOON_DAYS = 5;

export const PARTICULARS_PROVISION = "regulation 15 of the Data Protection (Registration of Data Controllers and Data Processors) Regulations, 2021";

export type RegisteredRole = "controller" | "processor";

export interface ParticularChangeLike {
  changedOn: string;
  notifiedOn: string | null;
}

/** The last day to notify the ODPC, as YYYY-MM-DD. */
export function notifyBy(c: Pick<ParticularChangeLike, "changedOn">): string {
  return addDays(c.changedOn, NOTIFY_DAYS);
}

/** Days from today to the deadline (0 on the day, negative once passed). */
export function daysToNotify(c: Pick<ParticularChangeLike, "changedOn">, today: string): number {
  return daysBetween(today, notifyBy(c));
}

export type ParticularChangeStatus = "due" | "due_soon" | "overdue" | "notified";

export function particularChangeStatus(c: ParticularChangeLike, today: string): ParticularChangeStatus {
  if (c.notifiedOn) return "notified";
  const left = daysToNotify(c, today);
  if (left < 0) return "overdue";
  return left <= DUE_SOON_DAYS ? "due_soon" : "due";
}

export const PARTICULAR_CHANGE_STATUS_LABEL: Record<ParticularChangeStatus, string> = {
  due: "Notice due",
  due_soon: "Due soon",
  overdue: "Overdue",
  notified: "ODPC notified",
};

/** Notified after the 14 days. */
export function notifiedLate(c: ParticularChangeLike): boolean {
  return Boolean(c.notifiedOn && c.notifiedOn > notifyBy(c));
}

/** "the controller registration", "both registrations". */
export function roleLabel(role: RegisteredRole | null): string {
  return role ? `the ${role} registration` : "both registrations";
}

export { formatDaysLeft };

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export type ParticularChangeAlertKind = "due_soon" | "overdue";

/**
 * The alert email to send now, or null: once when the deadline is close and
 * once when it has passed, only the most urgent stage for a change logged late.
 */
export function dueParticularChangeAlert(
  c: ParticularChangeLike,
  today: string,
  alreadySent: ReadonlySet<string>,
): ParticularChangeAlertKind | null {
  const status = particularChangeStatus(c, today);
  if (status !== "due_soon" && status !== "overdue") return null;
  return alreadySent.has(status) ? null : status;
}

// ---------------------------------------------------------------------------
// Spotting changes elsewhere in the app that may need a notice.
// ---------------------------------------------------------------------------

/**
 * What the registration application describes (s.19(2) of the Act): the
 * purpose, who the data is about, what data, who receives it, transfers abroad
 * and the safeguards. A change to any
 * of these in the RoPA may change the registered particulars. Retention,
 * systems, the owner and the DPIA flags aren't part of the register.
 */
export const ROPA_PARTICULARS = {
  purpose: "purpose",
  role: "controller or processor",
  dataSubjects: "data subjects",
  dataCategories: "personal data",
  sensitiveCategories: "sensitive data",
  recipients: "recipients",
  crossBorder: "transfers outside Kenya",
  transferCountries: "transfer countries",
  securityMeasures: "security measures",
} as const;

/** The organisation details the register holds. */
export const ORGANIZATION_PARTICULARS = {
  name: "name",
  kraPin: "KRA PIN",
  address: "address",
  privacyContact: "contact person",
  privacyEmail: "contact email",
  privacyPhone: "contact phone",
} as const;

function same(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => {
    if (v === null || v === undefined || v === "") return "";
    if (Array.isArray(v)) return JSON.stringify([...v].map(String).sort());
    return String(v).trim();
  };
  return norm(a) === norm(b);
}

/** Labels of the registered particulars that differ, in label order. */
export function changedParticulars(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string>,
): string[] {
  return Object.entries(labels)
    .filter(([key]) => key in after && !same(before[key], after[key]))
    .map(([, label]) => label);
}

export interface ActivityLike {
  name: string;
  role: RegisteredRole | null;
  [key: string]: unknown;
}

export interface SuggestedChange {
  /** Null when it may touch both registrations. */
  role: RegisteredRole | null;
  description: string;
}

/**
 * What to suggest logging after a RoPA activity is added, edited or deleted,
 * or null when nothing registered changed. `before` is null for a new
 * activity, `after` null for a deleted one.
 */
export function ropaParticularChange(before: ActivityLike | null, after: ActivityLike | null): SuggestedChange | null {
  if (!before && !after) return null;
  const q = (name: string) => `“${name}”`;
  if (!before) {
    const a = after as ActivityLike;
    return { role: a.role, description: `Added the processing activity ${q(a.name)}: ${String(a.purpose ?? "").trim() || "new purpose"}` };
  }
  if (!after) return { role: before.role, description: `Stopped the processing activity ${q(before.name)}` };
  const fields = changedParticulars(before, after, ROPA_PARTICULARS);
  if (fields.length === 0) return null;
  return {
    role: before.role === after.role ? after.role : null,
    description: `Changed the ${fields.join(", ")} of the processing activity ${q(after.name)}`,
  };
}

/** What to suggest logging after several activities are added at once, or null for none. */
export function addedActivitiesChange(added: readonly ActivityLike[]): SuggestedChange | null {
  if (added.length <= 1) return added.length ? ropaParticularChange(null, added[0]) : null;
  const roles = new Set(added.map((a) => a.role));
  return {
    role: roles.size === 1 ? added[0].role : null,
    description: `Added the processing activities ${added.map((a) => `“${a.name}”`).join(", ")}`,
  };
}

/** The RoPA list's address after a save, carrying a suggestion to log a change. */
export function ropaHref(change: SuggestedChange | null): string {
  if (!change) return "/ropa";
  const params = new URLSearchParams({ changed: change.role ?? "both", what: change.description.slice(0, 500) });
  return `/ropa?${params}`;
}

/** Reads the suggestion `ropaHref` put in the address back out, or null. */
export function suggestionFromQuery(query: Record<string, string | string[] | undefined>): SuggestedChange | null {
  const { changed, what } = query;
  if (typeof what !== "string" || !what.trim() || typeof changed !== "string") return null;
  if (changed !== "controller" && changed !== "processor" && changed !== "both") return null;
  return { role: changed === "both" ? null : changed, description: what.trim().slice(0, 500) };
}

/** What to suggest logging after the organisation's details change, or null. */
export function organizationParticularChange(before: Record<string, unknown>, after: Record<string, unknown>): SuggestedChange | null {
  const fields = changedParticulars(before, after, ORGANIZATION_PARTICULARS);
  if (fields.length === 0) return null;
  return { role: null, description: `Changed the organisation's ${fields.join(", ")}` };
}

/**
 * Whether the suggestion applies to a registration the organisation holds.
 * Only an issued certificate has particulars on the register to change.
 */
export function affectsRegistration(
  role: RegisteredRole | null,
  registrations: readonly { role: string; issuedOn: string | null }[],
): boolean {
  return registrations.some((r) => r.issuedOn && (role === null || r.role === role));
}

/**
 * The link to log a suggested change, with the form filled in. The values come
 * back through the URL, so they are plain text and capped.
 */
export function logChangeHref(change: SuggestedChange, changedOn?: string): string {
  const params = new URLSearchParams();
  if (change.role) params.set("role", change.role);
  params.set("what", change.description.slice(0, 500));
  if (changedOn) params.set("changedOn", changedOn);
  return `/registrations/changes/new?${params}`;
}
