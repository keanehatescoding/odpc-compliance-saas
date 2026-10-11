import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  breachActivities,
  breaches,
  breachUpdates,
  dpiaRisks,
  dpias,
  processingActivities,
  processorActivities,
  processors,
  registrations,
  reminderLog,
  subjectRequests,
  trainingSessions,
  users,
} from "@/db/schema";
import { buildComplianceReport, type ReportActivity, type ReportOrg } from "./compliance-report";
import { buildPrivacyNotice, controlled, noticeAudiences, type NoticeActivity, type NoticeOrg } from "./privacy-notice";
import type { ActivityInput } from "./ropa";

// Every query takes the organisation id explicitly so tenant scoping is visible at each call site.

export function listRegistrations(orgId: string) {
  return db.select().from(registrations).where(eq(registrations.orgId, orgId)).orderBy(asc(registrations.role));
}

export async function getRegistration(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(registrations)
    .where(and(eq(registrations.orgId, orgId), eq(registrations.id, id)))
    .limit(1);
  return row ?? null;
}

export function listActivities(orgId: string) {
  return db
    .select()
    .from(processingActivities)
    .where(eq(processingActivities.orgId, orgId))
    .orderBy(asc(processingActivities.name));
}

export async function getActivity(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(processingActivities)
    .where(and(eq(processingActivities.orgId, orgId), eq(processingActivities.id, id)))
    .limit(1);
  return row ?? null;
}

export function recentReminders(orgId: string, limit = 5) {
  return db
    .select({
      id: reminderLog.id,
      role: registrations.role,
      thresholdDays: reminderLog.thresholdDays,
      recipients: reminderLog.recipients,
      sentAt: reminderLog.sentAt,
    })
    .from(reminderLog)
    .innerJoin(registrations, eq(registrations.id, reminderLog.registrationId))
    .where(eq(registrations.orgId, orgId))
    .orderBy(desc(reminderLog.sentAt))
    .limit(limit);
}

export function listBreaches(orgId: string) {
  return db.select().from(breaches).where(eq(breaches.orgId, orgId)).orderBy(desc(breaches.discoveredAt));
}

export async function getBreach(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(breaches)
    .where(and(eq(breaches.orgId, orgId), eq(breaches.id, id)))
    .limit(1);
  return row ?? null;
}

/** The RoPA activities linked to a breach (already org-scoped via the breach). */
export function breachActivityList(breachId: string) {
  return db
    .select({ id: processingActivities.id, name: processingActivities.name })
    .from(breachActivities)
    .innerJoin(processingActivities, eq(processingActivities.id, breachActivities.activityId))
    .where(eq(breachActivities.breachId, breachId))
    .orderBy(asc(processingActivities.name));
}

export function listBreachUpdates(breachId: string) {
  return db
    .select({ id: breachUpdates.id, note: breachUpdates.note, createdAt: breachUpdates.createdAt, author: users.name })
    .from(breachUpdates)
    .leftJoin(users, eq(users.id, breachUpdates.userId))
    .where(eq(breachUpdates.breachId, breachId))
    .orderBy(desc(breachUpdates.createdAt));
}

export function listDpias(orgId: string) {
  return db
    .select({ dpia: dpias, activityName: processingActivities.name })
    .from(dpias)
    .leftJoin(processingActivities, eq(processingActivities.id, dpias.activityId))
    .where(eq(dpias.orgId, orgId))
    .orderBy(asc(dpias.title));
}

export async function getDpia(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(dpias)
    .where(and(eq(dpias.orgId, orgId), eq(dpias.id, id)))
    .limit(1);
  return row ?? null;
}

export async function getDpiaForActivity(orgId: string, activityId: string) {
  const [row] = await db
    .select()
    .from(dpias)
    .where(and(eq(dpias.orgId, orgId), eq(dpias.activityId, activityId)))
    .limit(1);
  return row ?? null;
}

/** A DPIA's risks in table order (already org-scoped via the DPIA). */
export function listDpiaRisks(dpiaId: string) {
  return db.select().from(dpiaRisks).where(eq(dpiaRisks.dpiaId, dpiaId)).orderBy(asc(dpiaRisks.position));
}

/** Every DPIA risk in the organisation, for summarising residual risk per DPIA. */
export function listOrgDpiaRisks(orgId: string) {
  return db
    .select({
      dpiaId: dpiaRisks.dpiaId,
      residualLikelihood: dpiaRisks.residualLikelihood,
      residualSeverity: dpiaRisks.residualSeverity,
    })
    .from(dpiaRisks)
    .innerJoin(dpias, eq(dpias.id, dpiaRisks.dpiaId))
    .where(eq(dpias.orgId, orgId));
}

export function listSubjectRequests(orgId: string) {
  return db
    .select()
    .from(subjectRequests)
    .where(eq(subjectRequests.orgId, orgId))
    .orderBy(desc(subjectRequests.receivedOn), desc(subjectRequests.createdAt));
}

export async function getSubjectRequest(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(subjectRequests)
    .where(and(eq(subjectRequests.orgId, orgId), eq(subjectRequests.id, id)))
    .limit(1);
  return row ?? null;
}

export function listProcessors(orgId: string) {
  return db.select().from(processors).where(eq(processors.orgId, orgId)).orderBy(asc(processors.name));
}

export async function getProcessor(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(processors)
    .where(and(eq(processors.orgId, orgId), eq(processors.id, id)))
    .limit(1);
  return row ?? null;
}

/** Which processor handles which RoPA activity, across the organisation. */
export function listProcessorLinks(orgId: string) {
  return db
    .select({ processorId: processorActivities.processorId, activityId: processorActivities.activityId })
    .from(processorActivities)
    .innerJoin(processors, eq(processors.id, processorActivities.processorId))
    .where(eq(processors.orgId, orgId));
}

/** The processors that handle an activity's data, by name. */
export function activityProcessors(orgId: string, activityId: string) {
  return db
    .select({ processor: processors })
    .from(processorActivities)
    .innerJoin(processors, eq(processors.id, processorActivities.processorId))
    .where(and(eq(processors.orgId, orgId), eq(processorActivities.activityId, activityId)))
    .orderBy(asc(processors.name))
    .then((rows) => rows.map((r) => r.processor));
}

/** Training sessions, most recent first. */
export function listTrainingSessions(orgId: string) {
  return db.select().from(trainingSessions).where(eq(trainingSessions.orgId, orgId)).orderBy(desc(trainingSessions.heldOn), asc(trainingSessions.title));
}

export async function getTrainingSession(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(trainingSessions)
    .where(and(eq(trainingSessions.orgId, orgId), eq(trainingSessions.id, id)))
    .limit(1);
  return row ?? null;
}

/**
 * The organisation's privacy notice. `requested` picks the people it's for, by
 * a category of data subject from the RoPA, and none means everyone. `notice`
 * is null when it names a category the RoPA doesn't have.
 */
export async function getPrivacyNotice(org: NoticeOrg & { id: string }, requested: string | null | undefined, today: string) {
  const [rows, regs, processorRows, links] = await Promise.all([
    listActivities(org.id),
    listRegistrations(org.id),
    listProcessors(org.id),
    listProcessorLinks(org.id),
  ]);
  const linked = new Map<string, Set<string>>();
  for (const l of links) {
    const ids = linked.get(l.activityId);
    if (ids) ids.add(l.processorId);
    else linked.set(l.activityId, new Set([l.processorId]));
  }
  const activities: NoticeActivity[] = rows.map((a) => {
    const ids = linked.get(a.id);
    return {
      ...(a as ActivityInput),
      processors: ids ? processorRows.filter((p) => ids.has(p.id)).map((p) => p.name) : [],
    };
  });
  const audiences = noticeAudiences(controlled(activities));
  const wanted = requested?.trim().toLowerCase() || null;
  const audience = wanted === null ? null : audiences.find((a) => a.toLowerCase() === wanted);
  const notice = audience === undefined ? null : buildPrivacyNotice({ org, activities, registrations: regs, audience, today });
  return { notice, audiences, activityCount: activities.length };
}

/** The organisation's compliance report as of `now`, from every record it keeps. */
export async function getComplianceReport(org: ReportOrg & { id: string }, now: Date) {
  const [regs, activities, dpiaRows, dpiaRisks, breachRows, requests, processorRows, processorLinks, training] = await Promise.all([
    listRegistrations(org.id),
    listActivities(org.id),
    listDpias(org.id),
    listOrgDpiaRisks(org.id),
    listBreaches(org.id),
    listSubjectRequests(org.id),
    listProcessors(org.id),
    listProcessorLinks(org.id),
    listTrainingSessions(org.id),
  ]);
  return buildComplianceReport({
    org,
    registrations: regs,
    activities: activities as ReportActivity[],
    dpias: dpiaRows.map((d) => d.dpia),
    dpiaRisks,
    breaches: breachRows,
    requests,
    processors: processorRows,
    processorLinks,
    training,
    now,
  });
}
