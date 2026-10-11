import { notificationDeadline, notificationRequired, notifiedLate, outstandingTasks, type BreachLike } from "./breach";
import { addMonths, formatDate, formatDateTime, todayInKenya } from "./dates";
import { LAWFUL_BASES, REGISTRATION_ROLES, type LawfulBasis, type RegistrationRole } from "./dpa";
import { DPIA_STATUS_LABEL, dpiaStatus, highestLevel, residualLevel, RISK_LEVEL_LABEL, type DpiaLike, type RiskLevel } from "./dpia";
import { controlled, noticeAudiences } from "./privacy-notice";
import { PROCESSOR_STATUS_LABEL, processorStatus } from "./processor";
import { daysUntilExpiry, registrationStatus, STATUS_LABEL, type RegistrationLike } from "./registration";
import { dpiaRecommended, type ActivityInput } from "./ropa";
import {
  daysToRespond,
  formatDaysLeft,
  isOpen,
  kindInfo,
  REQUEST_KIND_KEYS,
  requestStatus,
  respondedLate,
  type RequestLike,
} from "./subject-request";
import { refreshedIds, TRAINING_STATUS_LABEL, trainingStatus, type TrainingLike } from "./training";

/**
 * Where an organisation stands, area by area, written from the records it
 * keeps: something to hand a board, an auditor or an ODPC inspector. Each
 * section gives the figures, the records behind them and what is still open.
 *
 * It reports what has been recorded and never says the organisation complies.
 * It names no data subject: requests are counted by type, not listed by
 * requester, because the report is meant to leave the building.
 */

/** Breaches, requests and training are reported over this many months up to the day of the report. */
export const REPORT_PERIOD_MONTHS = 12;

export interface ReportOrg {
  privacyContact: string | null;
  privacyEmail: string | null;
  privacyPhone: string | null;
  address: string | null;
}

export interface ReportRegistration extends RegistrationLike {
  role: string;
  certificateNumber: string | null;
}

export type ReportActivity = ActivityInput & { id: string; updatedAt: Date };

export interface ReportDpia extends DpiaLike {
  id: string;
  title: string;
  activityId: string | null;
  odpcConsultedOn: string | null;
}

export interface ReportDpiaRisk {
  dpiaId: string;
  residualLikelihood: string;
  residualSeverity: string;
}

export interface ReportBreach extends BreachLike {
  title: string;
}

export interface ReportProcessor {
  id: string;
  name: string;
  service: string;
  location: string;
  outsideKenya: boolean;
  guarantees: string;
  contractSignedOn: string | null;
  contractReviewOn: string | null;
}

export interface ReportTraining extends TrainingLike {
  title: string;
  heldOn: string;
  audience: string;
  attendeeCount: number | null;
  evidence: string;
}

export interface ReportInput {
  org: ReportOrg;
  registrations: ReportRegistration[];
  activities: ReportActivity[];
  dpias: ReportDpia[];
  dpiaRisks: ReportDpiaRisk[];
  breaches: ReportBreach[];
  requests: RequestLike[];
  processors: ReportProcessor[];
  processorLinks: { processorId: string; activityId: string }[];
  training: ReportTraining[];
  now: Date;
}

export type ReportSectionKey = "registration" | "ropa" | "notice" | "dpia" | "breach" | "request" | "processor" | "training";

export interface ReportSection {
  key: ReportSectionKey;
  heading: string;
  /** The provision the section answers to. */
  basis: string;
  /** Where in the app the records are kept. */
  href: string;
  facts: { label: string; value: string }[];
  table?: { columns: string[]; rows: string[][] };
  /** What the records show is missing, late or due. Empty when nothing is. */
  open: string[];
}

export interface ComplianceReport {
  preparedOn: string;
  /** First day of the period breaches, requests and training are counted over. */
  periodFrom: string;
  sections: ReportSection[];
  openCount: number;
}

const names = (items: { name: string }[]) => items.map((i) => i.name).join(", ");
const titles = (items: { title: string }[]) => items.map((i) => i.title).join(", ");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const count = (n: number) => String(n);
const days = (n: number) => plural(Math.abs(n), "day");

function registrationSection(input: ReportInput, today: string): ReportSection {
  const open: string[] = [];
  const rows = input.registrations.map((r) => {
    const role = REGISTRATION_ROLES[r.role as RegistrationRole];
    const status = registrationStatus(r, today);
    const left = daysUntilExpiry(r, today);
    if (status === "expired") {
      open.push(`The ${role.toLowerCase()} certificate expired on ${formatDate(r.expiresOn)}, ${days(left!)} ago, and no renewal application is recorded.`);
    } else if (status === "expiring_soon" || status === "renewal_due") {
      open.push(`The ${role.toLowerCase()} certificate expires on ${formatDate(r.expiresOn)}, in ${days(left!)}, and no renewal application is recorded.`);
    } else if (status === "not_started") {
      open.push(`No application for registration as a ${role.toLowerCase()} is recorded.`);
    }
    return [role, r.certificateNumber || "—", formatDate(r.issuedOn), formatDate(r.expiresOn), STATUS_LABEL[status]];
  });

  if (input.registrations.length === 0) {
    open.push("No ODPC registration is recorded.");
  } else {
    // The RoPA says which roles the organisation plays, so a role with no registration at all shows up here.
    for (const role of ["controller", "processor"] as const) {
      if (input.registrations.some((r) => r.role === role)) continue;
      const acting = input.activities.filter((a) => a.role === role);
      if (acting.length > 0) {
        open.push(
          `The RoPA records ${plural(acting.length, "activity", "activities")} carried out as a ${REGISTRATION_ROLES[role].toLowerCase()}, but no ${REGISTRATION_ROLES[role].toLowerCase()} registration is recorded.`,
        );
      }
    }
  }

  return {
    key: "registration",
    heading: "ODPC registration",
    basis: "Data Protection Act, 2019, ss.18–19",
    href: "/registrations",
    facts: [],
    table: rows.length > 0 ? { columns: ["Registered as", "Certificate no.", "Issued", "Expires", "Status"], rows } : undefined,
    open,
  };
}

function ropaSection(input: ReportInput): ReportSection {
  const { activities } = input;
  const open: string[] = [];
  const facts: ReportSection["facts"] = [{ label: "Processing activities recorded", value: count(activities.length) }];

  if (activities.length === 0) {
    open.push("No processing activities are recorded.");
  } else {
    const unconfirmed = activities.filter((a) => a.role === null);
    const roles = [
      `${activities.filter((a) => a.role === "controller").length} as controller`,
      `${activities.filter((a) => a.role === "processor").length} as processor`,
      ...(unconfirmed.length > 0 ? [`${unconfirmed.length} not yet said`] : []),
    ];
    const bases = (Object.keys(LAWFUL_BASES) as LawfulBasis[])
      .map((b) => ({ label: LAWFUL_BASES[b], n: activities.filter((a) => a.lawfulBasis === b).length }))
      .filter((b) => b.n > 0)
      .map((b) => `${b.label} (${b.n})`);
    const lastChanged = activities.reduce((latest, a) => (a.updatedAt > latest ? a.updatedAt : latest), activities[0].updatedAt);
    facts.push(
      { label: "Role", value: roles.join(", ") },
      { label: "Lawful bases relied on", value: bases.join("; ") },
      { label: "Involving sensitive personal data", value: count(activities.filter((a) => a.sensitiveCategories.length > 0).length) },
      { label: "Involving children's data", value: count(activities.filter((a) => a.involvesChildren).length) },
      { label: "Transferring data outside Kenya", value: count(activities.filter((a) => a.crossBorder).length) },
      { label: "Last changed", value: formatDate(todayInKenya(lastChanged)) },
    );

    if (unconfirmed.length > 0) open.push(`Whether the organisation is the controller or a processor isn't recorded for: ${names(unconfirmed)}.`);
    const unprotected = activities.filter((a) => !a.securityMeasures);
    if (unprotected.length > 0) open.push(`No security measures are recorded for: ${names(unprotected)}.`);
    const unsafeguarded = activities.filter((a) => a.crossBorder && !a.transferSafeguards);
    if (unsafeguarded.length > 0) open.push(`No safeguards are recorded for the transfer outside Kenya in: ${names(unsafeguarded)}.`);
  }

  return {
    key: "ropa",
    heading: "Record of processing activities",
    basis: "Data Protection Act, 2019, ss.25 and 30",
    href: "/ropa",
    facts,
    open,
  };
}

function noticeSection(input: ReportInput): ReportSection {
  const { org } = input;
  const covered = controlled(input.activities);
  const audiences = noticeAudiences(covered);
  const contact = [org.privacyContact, org.privacyEmail, org.privacyPhone].filter(Boolean).join(", ");
  const open: string[] = [];
  if (!org.privacyEmail && !org.privacyPhone) open.push("No email address or phone number is recorded for people to contact about their data.");
  if (!org.address) open.push("No physical or postal address is recorded for the privacy notice.");

  return {
    key: "notice",
    heading: "Privacy notice",
    basis: "Data Protection Act, 2019, s.29",
    href: "/ropa/notice",
    facts: [
      { label: "Contact for data protection", value: contact || "Not recorded" },
      { label: "Address", value: org.address || "Not recorded" },
      { label: "Activities the notice describes", value: count(covered.length) },
      ...(audiences.length > 0 ? [{ label: "Written for", value: audiences.join(", ") }] : []),
    ],
    open,
  };
}

function dpiaSection(input: ReportInput, today: string): ReportSection {
  const { dpias } = input;
  const open: string[] = [];
  const activityName = new Map(input.activities.map((a) => [a.id, a.name]));
  const residual = new Map<string, RiskLevel[]>();
  for (const r of input.dpiaRisks) {
    const levels = residual.get(r.dpiaId);
    if (levels) levels.push(residualLevel(r));
    else residual.set(r.dpiaId, [residualLevel(r)]);
  }

  const statusOf = new Map(dpias.map((d) => [d.id, dpiaStatus(d, today)]));
  const byActivity = new Map(dpias.filter((d) => d.activityId).map((d) => [d.activityId!, d]));
  const flagged = input.activities.filter(dpiaRecommended);
  const unassessed = flagged.filter((a) => !byActivity.has(a.id));
  const signedOff = flagged.filter((a) => {
    const d = byActivity.get(a.id);
    return d !== undefined && statusOf.get(d.id) !== "draft";
  });

  if (unassessed.length > 0) open.push(`Screening flags these activities as likely to be high risk, and no impact assessment has been started: ${names(unassessed)}.`);
  const drafts = dpias.filter((d) => statusOf.get(d.id) === "draft");
  if (drafts.length > 0) open.push(`Not yet approved: ${titles(drafts)}.`);
  for (const d of dpias) {
    if (statusOf.get(d.id) === "review_due") open.push(`${d.title} was due for review on ${formatDate(d.reviewOn)}.`);
  }

  const rows = dpias.map((d) => {
    const level = highestLevel(residual.get(d.id) ?? []);
    return [
      d.title,
      d.activityId ? (activityName.get(d.activityId) ?? "—") : "Planned processing",
      DPIA_STATUS_LABEL[statusOf.get(d.id)!],
      formatDate(d.approvedOn),
      formatDate(d.reviewOn),
      level ? RISK_LEVEL_LABEL[level] : "No risks recorded",
      formatDate(d.odpcConsultedOn),
    ];
  });

  return {
    key: "dpia",
    heading: "Data protection impact assessments",
    basis: "Data Protection Act, 2019, s.31",
    href: "/dpia",
    facts: [
      { label: "Activities flagged by screening", value: count(flagged.length) },
      { label: "Of those, with an approved assessment", value: count(signedOff.length) },
      { label: "Assessments on record", value: count(dpias.length) },
    ],
    table:
      rows.length > 0
        ? { columns: ["Assessment", "Covers", "Status", "Approved", "Next review", "Highest risk after measures", "ODPC consulted"], rows }
        : undefined,
    open,
  };
}

/** What the record says about notifying the ODPC, or the controller. */
function breachNotification(b: ReportBreach, now: Date): string {
  if (b.notifiedAt) return `${formatDateTime(b.notifiedAt)} (${notifiedLate(b) ? "after the deadline" : "on time"})`;
  if (!notificationRequired(b)) return "Not required: harm assessed as unlikely";
  if (b.closedAt) return "Closed without a notification on record";
  const deadline = notificationDeadline(b);
  return now > deadline ? `Overdue since ${formatDateTime(deadline)}` : `Due by ${formatDateTime(deadline)}`;
}

/**
 * What s.43 still asks for on a breach. Closing one in the app doesn't
 * discharge the duty to assess it, notify or tell the people affected, so
 * unlike the dashboard's tasks these don't stop at closure.
 */
function unmetDuties(b: ReportBreach): string[] {
  return outstandingTasks({ ...b, closedAt: null });
}

function breachSection(input: ReportInput, periodFrom: string): ReportSection {
  const { now } = input;
  const inPeriod = input.breaches.filter((b) => todayInKenya(b.discoveredAt) >= periodFrom);
  const open: string[] = [];
  // A breach from before the period still belongs here while something on it is outstanding.
  const listed = input.breaches.filter((b) => inPeriod.includes(b) || unmetDuties(b).length > 0);
  for (const b of listed) {
    const tasks = unmetDuties(b);
    if (tasks.length === 0) continue;
    const late = notificationRequired(b) && !b.notifiedAt && now > notificationDeadline(b);
    const todo = tasks.map((t) => t.replace(/^./, (c) => c.toLowerCase())).join("; ");
    open.push(`${b.title}: ${b.closedAt ? "closed, but " : ""}still to do: ${todo}${late ? ". The notification deadline has passed" : ""}.`);
  }

  const notifiable = inPeriod.filter(notificationRequired);
  const rows = [...listed]
    .sort((a, b) => b.discoveredAt.getTime() - a.discoveredAt.getTime())
    .map((b) => [
      formatDateTime(b.discoveredAt),
      b.title,
      breachNotification(b, now),
      b.subjectsNotifiedAt ? formatDateTime(b.subjectsNotifiedAt) : "—",
      b.closedAt ? `Closed ${formatDateTime(b.closedAt)}` : "Open",
    ]);

  return {
    key: "breach",
    heading: "Personal data breaches",
    basis: "Data Protection Act, 2019, s.43",
    href: "/breaches",
    facts: [
      { label: "Breaches logged in the period", value: count(inPeriod.length) },
      { label: "Needing notification", value: count(notifiable.length) },
      { label: "Notified within the deadline", value: count(notifiable.filter((b) => b.notifiedAt && !notifiedLate(b)).length) },
      { label: "Notified after the deadline", value: count(notifiable.filter((b) => notifiedLate(b)).length) },
      { label: "Not yet notified", value: count(notifiable.filter((b) => !b.notifiedAt).length) },
    ],
    table: rows.length > 0 ? { columns: ["Became aware", "Breach", "Notification", "People affected told", "State"], rows } : undefined,
    open,
  };
}

function requestSection(input: ReportInput, today: string, periodFrom: string): ReportSection {
  const inPeriod = input.requests.filter((r) => r.receivedOn >= periodFrom);
  const answered = inPeriod.filter((r) => !isOpen(requestStatus(r, today)));
  const open = input.requests
    .filter((r) => requestStatus(r, today) === "overdue")
    .map((r) => {
      const info = kindInfo(r.kind);
      return `${info.short.replace(/^./, (c) => c.toUpperCase())} received ${formatDate(r.receivedOn)}: not answered, ${formatDaysLeft(daysToRespond(r, today))} (${info.days} days allowed).`;
    });

  const rows = REQUEST_KIND_KEYS.map((kind) => {
    const of = inPeriod.filter((r) => r.kind === kind);
    const done = of.filter((r) => !isOpen(requestStatus(r, today)));
    return { kind, of, done };
  })
    .filter(({ of }) => of.length > 0)
    .map(({ kind, of, done }) => [
      kindInfo(kind).label,
      `${kindInfo(kind).days} days`,
      count(of.length),
      count(done.filter((r) => !respondedLate(r)).length),
      count(done.filter(respondedLate).length),
      count(of.length - done.length),
    ]);

  return {
    key: "request",
    heading: "Data subject requests",
    basis: "Data Protection Act, 2019, s.26; Data Protection (General) Regulations, 2021, regs. 7–12 and 18",
    href: "/requests",
    facts: [
      { label: "Requests received in the period", value: count(inPeriod.length) },
      { label: "Answered within the time allowed", value: count(answered.filter((r) => !respondedLate(r)).length) },
      { label: "Answered late", value: count(answered.filter(respondedLate).length) },
      { label: "Declined, with reasons", value: count(answered.filter((r) => r.outcome === "declined").length) },
      { label: "Awaiting a response", value: count(inPeriod.length - answered.length) },
    ],
    table: rows.length > 0 ? { columns: ["Request", "Time allowed", "Received", "Answered in time", "Answered late", "Open"], rows } : undefined,
    open,
  };
}

function processorSection(input: ReportInput, today: string): ReportSection {
  const { processors } = input;
  const open: string[] = [];
  const statusOf = new Map(processors.map((p) => [p.id, processorStatus(p, today)]));
  const uncontracted = processors.filter((p) => statusOf.get(p.id) === "no_contract");
  if (uncontracted.length > 0) open.push(`No written contract is recorded with: ${names(uncontracted)}.`);
  for (const p of processors) {
    if (statusOf.get(p.id) === "review_due") open.push(`The contract with ${p.name} was due for review on ${formatDate(p.contractReviewOn)}.`);
  }
  const unchecked = processors.filter((p) => !p.guarantees);
  if (unchecked.length > 0) open.push(`How their security was checked isn't recorded for: ${names(unchecked)}.`);

  const activity = new Map(input.activities.map((a) => [a.id, a]));
  for (const p of processors.filter((x) => x.outsideKenya)) {
    const untransferred = input.processorLinks
      .filter((l) => l.processorId === p.id)
      .map((l) => activity.get(l.activityId))
      .filter((a) => a !== undefined && !a.crossBorder) as ReportActivity[];
    if (untransferred.length > 0) open.push(`${p.name} holds data outside Kenya, but the RoPA records no transfer for: ${names(untransferred)}.`);
  }

  const rows = processors.map((p) => [
    p.name,
    p.service,
    p.location || (p.outsideKenya ? "Outside Kenya" : "—"),
    formatDate(p.contractSignedOn),
    formatDate(p.contractReviewOn),
    PROCESSOR_STATUS_LABEL[statusOf.get(p.id)!],
  ]);

  return {
    key: "processor",
    heading: "Processors",
    basis: "Data Protection Act, 2019, s.42",
    href: "/processors",
    facts: [
      { label: "Processors on the register", value: count(processors.length) },
      { label: "With a written contract", value: count(processors.length - uncontracted.length) },
      { label: "Holding data outside Kenya", value: count(processors.filter((p) => p.outsideKenya).length) },
    ],
    table: rows.length > 0 ? { columns: ["Processor", "What they do", "Where", "Contract signed", "Next review", "Status"], rows } : undefined,
    open,
  };
}

function trainingSection(input: ReportInput, today: string, periodFrom: string): ReportSection {
  const sessions = [...input.training].sort((a, b) => b.heldOn.localeCompare(a.heldOn));
  const refreshed = refreshedIds(sessions);
  const statusOf = new Map(sessions.map((s) => [s.id, trainingStatus(s, refreshed, today)]));
  const inPeriod = sessions.filter((s) => s.heldOn >= periodFrom);
  const due = sessions.filter((s) => statusOf.get(s.id) === "refresher_due");
  // A session from before the period still belongs here while its refresher is outstanding.
  const listed = sessions.filter((s) => inPeriod.includes(s) || due.includes(s));

  const open: string[] = [];
  if (sessions.length === 0) open.push("No data protection training is recorded.");
  for (const s of due) open.push(`The refresher for ${s.title}, held ${formatDate(s.heldOn)}, was due on ${formatDate(s.refresherOn)}.`);
  if (sessions.length > 0 && inPeriod.length === 0 && due.length === 0) {
    open.push(`No training is recorded in the last ${REPORT_PERIOD_MONTHS} months. The most recent session was on ${formatDate(sessions[0].heldOn)}.`);
  }
  const unevidenced = listed.filter((s) => !s.evidence);
  if (unevidenced.length > 0) open.push(`Where the attendance record is kept isn't recorded for: ${titles(unevidenced)}.`);

  const uncounted = inPeriod.filter((s) => s.attendeeCount === null).length;
  const attendances = inPeriod.reduce((n, s) => n + (s.attendeeCount ?? 0), 0);
  const rows = listed.map((s) => [
    formatDate(s.heldOn),
    s.title,
    s.audience,
    s.attendeeCount === null ? "Not counted" : count(s.attendeeCount),
    formatDate(s.refresherOn),
    TRAINING_STATUS_LABEL[statusOf.get(s.id)!],
  ]);

  return {
    key: "training",
    heading: "Staff training",
    basis: "Data Protection Act, 2019, s.41 (organisational measures)",
    href: "/training",
    facts: [
      { label: "Sessions held in the period", value: count(inPeriod.length) },
      // Someone at two sessions counts twice, so this is attendances and says so.
      {
        label: "Attendances at those sessions",
        value: `${attendances}${uncounted > 0 ? `, with ${plural(uncounted, "session")} not counted` : ""}`,
      },
      { label: "Most recent session", value: sessions.length > 0 ? formatDate(sessions[0].heldOn) : "None recorded" },
    ],
    table: rows.length > 0 ? { columns: ["Held", "Session", "For", "Attended", "Refresher due", "Status"], rows } : undefined,
    open,
  };
}

export function buildComplianceReport(input: ReportInput): ComplianceReport {
  const today = todayInKenya(input.now);
  const periodFrom = addMonths(today, -REPORT_PERIOD_MONTHS);
  const sections = [
    registrationSection(input, today),
    ropaSection(input),
    noticeSection(input),
    dpiaSection(input, today),
    breachSection(input, periodFrom),
    requestSection(input, today, periodFrom),
    processorSection(input, today),
    trainingSection(input, today, periodFrom),
  ];
  return { preparedOn: today, periodFrom, sections, openCount: sections.reduce((n, s) => n + s.open.length, 0) };
}
