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
  registrations,
  reminderLog,
  subjectRequests,
  users,
} from "@/db/schema";

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
