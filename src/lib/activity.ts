import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import {
  activityLog,
  breaches,
  dpias,
  processingActivities,
  registrations,
  subjectRequests,
  users,
  type ActivityArea,
  type Breach,
  type Dpia,
  type Organization,
  type ProcessingActivity,
  type Registration,
  type SubjectRequest,
} from "@/db/schema";
import { formatDate } from "./dates";
import type { RequestKind } from "./subject-request";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface ActivityEntry {
  orgId: string;
  actorId: string;
  area: ActivityArea;
  subjectId?: string | null;
  /** Follows the actor's name, e.g. "edited the controller registration (expiry date)". */
  summary: string;
}

/**
 * Adds entries to the activity log. Call it inside the transaction that makes
 * the change, so the change and its entry are saved together or not at all.
 * The actor's name is copied from their account as it is now.
 */
export async function recordActivity(tx: Db | Tx, entries: ActivityEntry | ActivityEntry[], now: Date = new Date()) {
  const rows = Array.isArray(entries) ? entries : [entries];
  if (rows.length === 0) return;
  await tx.insert(activityLog).values(
    rows.map((e) => ({
      orgId: e.orgId,
      actorId: e.actorId,
      actorName: sql`coalesce((select ${users.name} from ${users} where ${users.id} = ${e.actorId}), '')`,
      area: e.area,
      subjectId: e.subjectId ?? null,
      summary: e.summary,
      createdAt: now,
    })),
  );
}

// ---------------------------------------------------------------------------
// Describing changes.
// ---------------------------------------------------------------------------

/** The fields each kind of record names when it's edited, as the form labels them. */
export const FIELD_LABELS = {
  registration: {
    role: "registered as",
    certificateNumber: "certificate number",
    appliedOn: "application date",
    issuedOn: "issue date",
    expiresOn: "expiry date",
    notes: "notes",
  } satisfies Partial<Record<keyof Registration, string>>,
  ropa: {
    name: "name",
    purpose: "purpose",
    lawfulBasis: "lawful basis",
    owner: "responsible person",
    dataSubjects: "data subjects",
    dataCategories: "personal data",
    sensitiveCategories: "sensitive data",
    recipients: "recipients",
    crossBorder: "transfers outside Kenya",
    transferCountries: "transfer countries",
    transferSafeguards: "transfer safeguards",
    retentionPeriod: "retention period",
    securityMeasures: "security measures",
    systems: "systems",
    systematicMonitoring: "systematic monitoring",
    largeScale: "large scale",
    involvesChildren: "children's data",
  } satisfies Partial<Record<keyof ProcessingActivity, string>>,
  breach: {
    title: "title",
    kind: "type of breach",
    role: "controller or processor",
    discoveredAt: "when you became aware",
    occurredAt: "when it happened",
    description: "description",
    dataSubjects: "who is affected",
    approxSubjects: "number affected",
    dataCategories: "personal data",
    sensitiveCategories: "sensitive data",
    activityIds: "processing activities",
    dataUnintelligible: "encrypted or unreadable",
    risk: "risk",
    riskNotes: "likely consequences",
    measures: "measures",
    subjectAdvice: "advice to affected people",
    unauthorisedParty: "who got the data",
    contactPerson: "contact person",
    notifiedAt: "notified on",
    notificationRef: "reference number",
    delayReason: "reasons for delay",
    subjectsNotifiedAt: "affected people notified on",
    subjectsNotifiedHow: "how affected people were notified",
    closedAt: "closed on",
    lessons: "lessons learned",
  } satisfies Partial<Record<keyof Breach | "activityIds", string>>,
  dpia: {
    title: "title",
    activityId: "processing activity",
    assessor: "prepared by",
    description: "description",
    purposes: "purposes and benefits",
    necessity: "necessity and proportionality",
    consultation: "who you consulted",
    conclusion: "conclusion",
    risks: "risks",
    approvedBy: "approved by",
    approvedOn: "approved on",
    reviewOn: "review by",
    odpcConsultedOn: "ODPC consulted on",
  } satisfies Partial<Record<keyof Dpia | "risks", string>>,
  request: {
    kind: "type of request",
    receivedOn: "received on",
    details: "details",
    channel: "how it arrived",
    requesterName: "data subject",
    requesterContact: "contact details",
    representative: "made on their behalf by",
    identityCheck: "identity check",
    outcome: "outcome",
    respondedOn: "responded on",
    response: "response",
  } satisfies Partial<Record<keyof SubjectRequest, string>>,
  organization: {
    name: "name",
    sector: "sector",
    size: "size",
    kraPin: "KRA PIN",
    reminderEmail: "where reminders go",
  } satisfies Partial<Record<keyof Organization, string>>,
};

/** Treats a cleared field ("" or null) as one value, and compares dates and lists by content. */
function comparable(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return String(value.getTime());
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** The labels of the fields whose value differs between `before` and `after`, in label order. */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string>,
): string[] {
  return Object.entries(labels)
    .filter(([key]) => key in after && comparable(before[key]) !== comparable(after[key]))
    .map(([, label]) => label);
}

/** "edited the DPIA “CCTV” (risks, conclusion)", or null when nothing changed. */
export function editSummary(noun: string, fields: string[]): string | null {
  return fields.length === 0 ? null : `edited ${noun} (${fields.join(", ")})`;
}

const quoted = (text: string) => `“${text}”`;

const REQUEST_NOUN: Record<RequestKind, string> = {
  access: "access",
  rectification: "correction",
  erasure: "erasure",
  restriction: "restriction",
  objection: "objection",
  portability: "portability",
  marketing: "marketing opt-out",
};

/**
 * How entries name each kind of record. A request is named by its type and
 * date, not the requester, so the log doesn't keep a data subject's name
 * after the request itself is deleted.
 */
export const describe = {
  registration: (r: Pick<Registration, "role">) => `the ${r.role} registration`,
  ropa: (a: Pick<ProcessingActivity, "name">) => `the RoPA activity ${quoted(a.name)}`,
  breach: (b: Pick<Breach, "title">) => `the breach ${quoted(b.title)}`,
  dpia: (d: Pick<Dpia, "title">) => `the DPIA ${quoted(d.title)}`,
  request: (r: Pick<SubjectRequest, "kind" | "receivedOn">) =>
    `the ${REQUEST_NOUN[r.kind as RequestKind]} request received ${formatDate(r.receivedOn)}`,
};

// ---------------------------------------------------------------------------
// Reading the log.
// ---------------------------------------------------------------------------

export const ACTIVITY_AREAS: Record<ActivityArea, string> = {
  registration: "ODPC registration",
  ropa: "Records of processing",
  dpia: "Impact assessments",
  breach: "Data breaches",
  request: "Data subject requests",
  team: "Team",
  organization: "Settings",
  billing: "Billing",
};

export const ACTIVITY_PAGE_SIZE = 50;

export type ActivityRow = typeof activityLog.$inferSelect;

/**
 * A page of the organisation's log, newest first. Pass the last entry's id
 * as `before` for the next page. Entries saved together share a time, so the
 * id breaks ties.
 */
export async function listActivity(
  db: Db,
  orgId: string,
  opts: { area?: ActivityArea; before?: string; limit?: number } = {},
): Promise<{ rows: ActivityRow[]; more: boolean }> {
  const limit = opts.limit ?? ACTIVITY_PAGE_SIZE;
  const rows = await db
    .select()
    .from(activityLog)
    .where(
      and(
        eq(activityLog.orgId, orgId),
        opts.area ? eq(activityLog.area, opts.area) : undefined,
        opts.before
          ? sql`(${activityLog.createdAt}, ${activityLog.id}) < (select ${activityLog.createdAt}, ${activityLog.id} from ${activityLog} where ${activityLog.id} = ${opts.before})`
          : undefined,
      ),
    )
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
    .limit(limit + 1);
  return { rows: rows.slice(0, limit), more: rows.length > limit };
}

/** Everything logged about one record, newest first. */
export function subjectHistory(db: Db, orgId: string, subjectId: string) {
  return db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.orgId, orgId), eq(activityLog.subjectId, subjectId)))
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id));
}

const SUBJECT_TABLES = {
  registration: registrations,
  ropa: processingActivities,
  dpia: dpias,
  breach: breaches,
  request: subjectRequests,
} as const;

const SUBJECT_PATHS: Record<keyof typeof SUBJECT_TABLES, string> = {
  registration: "/registrations",
  ropa: "/ropa",
  dpia: "/dpia",
  breach: "/breaches",
  request: "/requests",
};

/**
 * Links for the entries whose record still exists, keyed by entry id.
 * Entries about deleted records, the team, settings and billing get none.
 */
export async function subjectLinks(db: Db, orgId: string, rows: ActivityRow[]): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  await Promise.all(
    (Object.keys(SUBJECT_TABLES) as (keyof typeof SUBJECT_TABLES)[]).map(async (area) => {
      const ids = [...new Set(rows.filter((r) => r.area === area && r.subjectId).map((r) => r.subjectId!))];
      if (ids.length === 0) return;
      const table = SUBJECT_TABLES[area];
      const live = new Set(
        (await db.select({ id: table.id }).from(table).where(and(eq(table.orgId, orgId), inArray(table.id, ids)))).map((r) => r.id),
      );
      for (const r of rows) {
        if (r.area === area && r.subjectId && live.has(r.subjectId)) links.set(r.id, `${SUBJECT_PATHS[area]}/${r.subjectId}`);
      }
    }),
  );
  return links;
}
