import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  breachActivities,
  breaches,
  breachUpdates,
  processingActivities,
  registrations,
  reminderLog,
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
