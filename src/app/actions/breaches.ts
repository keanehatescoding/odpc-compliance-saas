"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { breachActivities, breaches, breachUpdates, processingActivities, type Breach } from "@/db/schema";
import { BREACH_RISKS, NOTIFY_WHOM } from "@/lib/breach";
import { parseBreachForm, type BreachFormData } from "@/lib/breach-form";
import { runBreachAlerts } from "@/lib/breach-alerts";
import { formatDateTime } from "@/lib/dates";
import { createEmailSender } from "@/lib/email";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { requireOrgContext } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

/** Creates or updates a breach. Edits carry the breach id in a hidden `id` field. */
export async function saveBreach(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireOrgContext();
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? rawId : null;
  if (id && !isUuid(id)) return { message: "Breach not found." };
  const parsed = parseBreachForm(formData, new Date());
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData) };
  const data = { ...parsed.data, discoveredAt: parsed.data.discoveredAt! };

  // Only link activities that belong to this organisation.
  const requested = formData
    .getAll("activityIds")
    .map(String)
    .filter(isUuid);
  const activityIds =
    requested.length === 0
      ? []
      : (
          await db
            .select({ id: processingActivities.id })
            .from(processingActivities)
            .where(and(eq(processingActivities.orgId, org.id), inArray(processingActivities.id, requested)))
        ).map((r) => r.id);

  const breachId = await db.transaction(async (tx) => {
    let saved: Breach;
    let notes: string[];
    if (id) {
      const [before] = await tx
        .select()
        .from(breaches)
        .where(and(eq(breaches.id, id), eq(breaches.orgId, org.id)))
        .for("update");
      if (!before) return null;
      [saved] = await tx.update(breaches).set(data).where(eq(breaches.id, id)).returning();
      notes = changeNotes(before, data);
      await tx.delete(breachActivities).where(eq(breachActivities.breachId, id));
    } else {
      [saved] = await tx
        .insert(breaches)
        .values({ ...data, orgId: org.id, reportedBy: user.id })
        .returning();
      notes = [`Breach logged. Became aware ${formatDateTime(data.discoveredAt)}.`, ...changeNotes(null, data)];
    }
    if (activityIds.length > 0) {
      await tx.insert(breachActivities).values(activityIds.map((activityId) => ({ breachId: saved.id, activityId })));
    }
    if (notes.length > 0) {
      await tx.insert(breachUpdates).values(notes.map((note) => ({ breachId: saved.id, userId: user.id, note })));
    }
    return saved.id;
  });
  if (!breachId) return { message: "Breach not found." };

  // Alert the team straight away rather than waiting for the next scheduled run.
  after(() => runBreachAlerts(db, createEmailSender(), { breachId }).catch((err) => console.error(err)));

  revalidatePath("/", "layout");
  redirect(`/breaches/${breachId}`);
}

/** Incident-log entries for milestones reached in this save. */
function changeNotes(before: Breach | null, after: BreachFormData): string[] {
  const whom = NOTIFY_WHOM[after.role];
  const notes: string[] = [];
  if (after.risk !== (before?.risk ?? "unassessed")) notes.push(`Risk assessed: ${BREACH_RISKS[after.risk]}.`);
  if (after.notifiedAt && !before?.notifiedAt) notes.push(`Notified ${whom} on ${formatDateTime(after.notifiedAt)}.`);
  if (after.subjectsNotifiedAt && !before?.subjectsNotifiedAt)
    notes.push(`Affected people notified on ${formatDateTime(after.subjectsNotifiedAt)}.`);
  if (after.closedAt && !before?.closedAt) notes.push(`Breach closed on ${formatDateTime(after.closedAt)}.`);
  if (!after.closedAt && before?.closedAt) notes.push("Breach reopened.");
  return notes;
}

const noteSchema = z.object({
  breachId: z.string().refine(isUuid),
  note: z.string().trim().min(1, { error: "Write a note." }).max(5000, { error: "Keep notes under 5,000 characters." }),
});

export async function addBreachUpdate(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireOrgContext();
  const parsed = noteSchema.safeParse({ breachId: formData.get("breachId"), note: formData.get("note") ?? "" });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData) };
  const { breachId, note } = parsed.data;

  const [owned] = await db
    .select({ id: breaches.id })
    .from(breaches)
    .where(and(eq(breaches.id, breachId), eq(breaches.orgId, org.id)))
    .limit(1);
  if (!owned) return { message: "Breach not found." };

  await db.insert(breachUpdates).values({ breachId, userId: user.id, note });
  revalidatePath(`/breaches/${breachId}`);
  return { message: "Note added." };
}

export async function deleteBreach(id: string): Promise<void> {
  const { org } = await requireOrgContext();
  if (typeof id === "string" && isUuid(id)) {
    await db.delete(breaches).where(and(eq(breaches.id, id), eq(breaches.orgId, org.id)));
  }
  revalidatePath("/", "layout");
  redirect("/breaches");
}
