// What Kinga staff see at /staff: how each organisation is getting on, and the
// service order queue. Staff see account and billing details, for which Kinga
// is the controller, and how many records each organisation keeps, but never
// the records themselves: the DPA promises only the organisation's team can.
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";
import type { Db } from "@/db";
import {
  activityLog,
  breaches,
  dpias,
  invitations,
  memberships,
  organizations,
  payments,
  processingActivities,
  registrations,
  renewalAttempts,
  savedCards,
  serviceOrders,
  subjectRequests,
  users,
  type Organization,
} from "@/db/schema";
import { accessFor, type Access, type AccessState } from "./plans";
import { openServiceOrders, serviceOrdersFor } from "./service-orders";

/** The addresses in STAFF_EMAILS (comma-separated), lowercased. */
export function staffEmails(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (env.STAFF_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Whether this account can open /staff: its address is listed and confirmed, so only whoever reads that mailbox gets in. */
export function isStaff(user: { email: string; emailVerifiedAt: Date | null }, env: NodeJS.ProcessEnv = process.env): boolean {
  return user.emailVerifiedAt !== null && staffEmails(env).has(user.email.toLowerCase());
}

/** The filters on the organisations list. "all" leaves out deleted organisations. */
export const ORG_FILTERS = {
  all: "All",
  trial: "On trial",
  active: "Paying",
  lapsed: "Lapsed",
  deleted: "Deleted",
} as const;
export type OrgFilter = keyof typeof ORG_FILTERS;

/** How many of each kind of record an organisation keeps. Counts only, never contents. */
export interface RecordCounts {
  registrations: number;
  ropa: number;
  dpias: number;
  breaches: number;
  requests: number;
}

// Drizzle leaves the table off column names when a query selects from one
// table, which would let "id" inside these subqueries mean the inner table's.
const qualified = (table: AnyPgTable, column: AnyPgColumn) => sql`${table}.${sql.identifier(column.name)}`;
const orgIdColumn = qualified(organizations, organizations.id);

const countFor = (table: typeof registrations | typeof processingActivities | typeof dpias | typeof breaches | typeof subjectRequests) =>
  sql<number>`(select count(*)::int from ${table} where ${qualified(table, table.orgId)} = ${orgIdColumn})`.mapWith(Number);

const recordCounts = {
  registrations: countFor(registrations),
  ropa: countFor(processingActivities),
  dpias: countFor(dpias),
  breaches: countFor(breaches),
  requests: countFor(subjectRequests),
};

// The latest change anyone on the team made, from the activity log.
const lastChangeAt = sql<Date | null>`(select max(${qualified(activityLog, activityLog.createdAt)}) from ${activityLog} where ${qualified(activityLog, activityLog.orgId)} = ${orgIdColumn})`.mapWith(
  activityLog.createdAt,
);

export interface OrgSummary {
  org: Organization;
  access: Access;
  counts: RecordCounts;
  teamSize: number;
  owners: { name: string; email: string; verified: boolean }[];
  lastChangeAt: Date | null;
}

/** Every organisation, newest first, with where it stands. */
export async function orgSummaries(db: Db, now: Date = new Date()): Promise<OrgSummary[]> {
  const rows = await db
    .select({ org: organizations, ...recordCounts, lastChangeAt })
    .from(organizations)
    .orderBy(desc(organizations.createdAt));
  const team = await db
    .select({
      orgId: memberships.orgId,
      role: memberships.role,
      name: users.name,
      email: users.email,
      verifiedAt: users.emailVerifiedAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .orderBy(memberships.createdAt);

  return rows.map(({ org, lastChangeAt, ...counts }) => {
    const members = team.filter((m) => m.orgId === org.id);
    return {
      org,
      access: accessFor(org, now),
      counts,
      teamSize: members.length,
      owners: members
        .filter((m) => m.role === "owner")
        .map((m) => ({ name: m.name, email: m.email, verified: m.verifiedAt !== null })),
      lastChangeAt,
    };
  });
}

/** Whether an organisation belongs under a filter on the list. */
export function matchesFilter(s: { org: { deletedAt: Date | null }; access: { state: AccessState } }, filter: OrgFilter): boolean {
  if (filter === "deleted") return s.org.deletedAt !== null;
  if (s.org.deletedAt !== null) return false;
  return filter === "all" || s.access.state === filter;
}

/** Trials ending within this many days count as "ending soon" on the overview. */
export const TRIAL_ENDING_DAYS = 7;

export interface Overview {
  trial: number;
  trialEnding: number;
  active: number;
  lapsed: number;
  autoRenew: number;
}

/** Totals across organisations that haven't been deleted. */
export function overview(summaries: OrgSummary[]): Overview {
  const live = summaries.filter((s) => s.org.deletedAt === null);
  return {
    trial: live.filter((s) => s.access.state === "trial").length,
    trialEnding: live.filter((s) => s.access.state === "trial" && s.access.daysLeft <= TRIAL_ENDING_DAYS).length,
    active: live.filter((s) => s.access.state === "active").length,
    lapsed: live.filter((s) => s.access.state === "lapsed").length,
    autoRenew: live.filter((s) => s.org.autoRenewInterval !== null).length,
  };
}

/** Renewal charges listed on an organisation's page. */
const RECENT_RENEWALS = 10;

/** One organisation in full, for its staff page, or null if there's no such organisation. */
export async function orgDetail(db: Db, orgId: string, now: Date = new Date()) {
  const [row] = await db
    .select({ org: organizations, ...recordCounts, lastChangeAt })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  if (!row) return null;
  const { org, lastChangeAt: lastChange, ...counts } = row;

  const [team, [pending], [card], paid, renewals, orders] = await Promise.all([
    db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        verifiedAt: users.emailVerifiedAt,
        role: memberships.role,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, orgId))
      .orderBy(memberships.createdAt),
    // Only how many: the invitees haven't joined, so their addresses stay with the team.
    db
      .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
      .from(invitations)
      .where(and(eq(invitations.orgId, orgId), gte(invitations.expiresAt, now))),
    db.select().from(savedCards).where(eq(savedCards.orgId, orgId)),
    db
      .select()
      .from(payments)
      .where(and(eq(payments.orgId, orgId), eq(payments.status, "succeeded")))
      .orderBy(desc(payments.paidAt)),
    db
      .select({ attempt: renewalAttempts, paymentStatus: payments.status })
      .from(renewalAttempts)
      .leftJoin(payments, eq(payments.id, renewalAttempts.paymentId))
      .where(eq(renewalAttempts.orgId, orgId))
      .orderBy(desc(renewalAttempts.createdAt))
      .limit(RECENT_RENEWALS),
    serviceOrdersFor(db, orgId),
  ]);

  return {
    org,
    access: accessFor(org, now),
    counts,
    lastChangeAt: lastChange,
    team,
    pendingInvitations: pending?.n ?? 0,
    card: card ?? null,
    payments: paid,
    renewals,
    orders,
  };
}

/**
 * The service order queue: paid and not yet delivered or cancelled, oldest
 * first, with the organisation and who ordered it.
 */
export async function staffServiceOrders(db: Db) {
  const open = await openServiceOrders(db);
  if (open.length === 0) return [];
  const orgIds = [...new Set(open.map((o) => o.order.orgId))];
  const requesterIds = open.map((o) => o.order.requestedBy).filter((id): id is string => id !== null);
  const [orgs, requesters] = await Promise.all([
    db
      .select({ id: organizations.id, name: organizations.name, deletedAt: organizations.deletedAt })
      .from(organizations)
      .where(inArray(organizations.id, orgIds)),
    requesterIds.length === 0
      ? []
      : db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, requesterIds)),
  ]);
  return open.map(({ order, payment }) => ({
    order,
    payment,
    org: orgs.find((o) => o.id === order.orgId)!,
    requester: requesters.find((u) => u.id === order.requestedBy) ?? null,
  }));
}

/** How many service orders are waiting on staff, for the nav. */
export async function openServiceOrderCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
    .from(serviceOrders)
    .where(inArray(serviceOrders.status, ["paid", "in_progress"]));
  return row?.n ?? 0;
}
