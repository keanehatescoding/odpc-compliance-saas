"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { disposals, processingActivities, type Disposal } from "@/db/schema";
import { changedFields, describe, editSummary, FIELD_LABELS, recordActivity } from "@/lib/activity";
import { todayInKenya } from "@/lib/dates";
import { parseDisposalForm } from "@/lib/disposal-form";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { requireActiveOrg } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

/** Creates or updates a disposal. Edits carry the record id in a hidden `id` field. */
export async function saveDisposal(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireActiveOrg();
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? rawId : null;
  if (id && !isUuid(id)) return { message: "Disposal not found." };
  const parsed = parseDisposalForm(formData, todayInKenya());
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData) };
  const data = parsed.data;

  // Only link an activity that belongs to this organisation.
  if (data.activityId) {
    const [activity] = await db
      .select({ id: processingActivities.id })
      .from(processingActivities)
      .where(and(eq(processingActivities.orgId, org.id), eq(processingActivities.id, data.activityId)))
      .limit(1);
    if (!activity) return { errors: { activityId: ["Choose an activity from the list."] }, values: formValues(formData) };
  }

  const disposalId = await db.transaction(async (tx) => {
    const log = (subjectId: string, summary: string) =>
      recordActivity(tx, { orgId: org.id, actorId: user.id, area: "disposal", subjectId, summary });
    let saved: Disposal;
    if (id) {
      const [before] = await tx
        .select()
        .from(disposals)
        .where(and(eq(disposals.id, id), eq(disposals.orgId, org.id)))
        .for("update");
      if (!before) return null;
      [saved] = await tx
        .update(disposals)
        .set(data)
        .where(and(eq(disposals.id, id), eq(disposals.orgId, org.id)))
        .returning();
      const summary = editSummary(describe.disposal(saved), changedFields(before, data, FIELD_LABELS.disposal));
      if (summary) await log(id, summary);
    } else {
      [saved] = await tx
        .insert(disposals)
        .values({ ...data, orgId: org.id })
        .returning();
      await log(saved.id, `recorded ${describe.disposal(saved)}`);
    }
    return saved.id;
  });
  if (!disposalId) return { message: "Disposal not found." };

  revalidatePath("/", "layout");
  redirect(`/disposals/${disposalId}`);
}

export async function deleteDisposal(id: string): Promise<void> {
  const { user, org } = await requireActiveOrg();
  if (typeof id === "string" && isUuid(id)) {
    await db.transaction(async (tx) => {
      const [gone] = await tx
        .delete(disposals)
        .where(and(eq(disposals.id, id), eq(disposals.orgId, org.id)))
        .returning();
      if (gone) {
        await recordActivity(tx, { orgId: org.id, actorId: user.id, area: "disposal", subjectId: id, summary: `deleted ${describe.disposal(gone)}` });
      }
    });
  }
  revalidatePath("/", "layout");
  redirect("/disposals");
}
