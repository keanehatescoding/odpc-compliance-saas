"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { interestAssessments, processingActivities, type InterestAssessment } from "@/db/schema";
import { changedFields, describe, editSummary, FIELD_LABELS, recordActivity } from "@/lib/activity";
import { parseLiaForm } from "@/lib/lia-form";
import { todayInKenya } from "@/lib/dates";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { requireActiveOrg } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

/** Creates or updates a legitimate interest assessment. Edits carry the record id in a hidden `id` field. */
export async function saveLia(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireActiveOrg();
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? rawId : null;
  if (id && !isUuid(id)) return { message: "Assessment not found." };
  const parsed = parseLiaForm(formData, todayInKenya());
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData) };
  const data = parsed.data;

  // Only link an activity that belongs to this organisation.
  const [activity] = await db
    .select({ id: processingActivities.id })
    .from(processingActivities)
    .where(and(eq(processingActivities.orgId, org.id), eq(processingActivities.id, data.activityId)))
    .limit(1);
  if (!activity) {
    return { errors: { activityId: ["Choose the processing activity this assessment is for."] }, values: formValues(formData) };
  }

  const liaId = await db.transaction(async (tx) => {
    const log = (subjectId: string, summary: string) =>
      recordActivity(tx, { orgId: org.id, actorId: user.id, area: "lia", subjectId, summary });
    let saved: InterestAssessment;
    if (id) {
      const [before] = await tx
        .select()
        .from(interestAssessments)
        .where(and(eq(interestAssessments.id, id), eq(interestAssessments.orgId, org.id)))
        .for("update");
      if (!before) return null;
      [saved] = await tx
        .update(interestAssessments)
        .set(data)
        .where(and(eq(interestAssessments.id, id), eq(interestAssessments.orgId, org.id)))
        .returning();
      const summary = editSummary(describe.lia(saved), changedFields(before, data, FIELD_LABELS.lia));
      if (summary) await log(id, summary);
    } else {
      [saved] = await tx
        .insert(interestAssessments)
        .values({ ...data, orgId: org.id })
        .returning();
      await log(saved.id, `added ${describe.lia(saved)}`);
    }
    return saved.id;
  });
  if (!liaId) return { message: "Assessment not found." };

  revalidatePath("/", "layout");
  redirect(`/lia/${liaId}`);
}

export async function deleteLia(id: string): Promise<void> {
  const { user, org } = await requireActiveOrg();
  if (typeof id === "string" && isUuid(id)) {
    await db.transaction(async (tx) => {
      const [gone] = await tx
        .delete(interestAssessments)
        .where(and(eq(interestAssessments.id, id), eq(interestAssessments.orgId, org.id)))
        .returning();
      if (gone) {
        await recordActivity(tx, { orgId: org.id, actorId: user.id, area: "lia", subjectId: id, summary: `deleted ${describe.lia(gone)}` });
      }
    });
  }
  revalidatePath("/", "layout");
  redirect("/lia");
}
