"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { trainingSessions, type TrainingSession } from "@/db/schema";
import { changedFields, describe, editSummary, FIELD_LABELS, recordActivity } from "@/lib/activity";
import { todayInKenya } from "@/lib/dates";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { parseTrainingForm, refresherErrors } from "@/lib/training-form";
import { requireActiveOrg } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

/** Creates or updates a training session. Edits carry the session id in a hidden `id` field. */
export async function saveTraining(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireActiveOrg();
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? rawId : null;
  if (id && !isUuid(id)) return { message: "Training session not found." };
  const parsed = parseTrainingForm(formData, todayInKenya());
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData) };
  const data = parsed.data;

  const result = await db.transaction(async (tx) => {
    const log = (subjectId: string, summary: string) =>
      recordActivity(tx, { orgId: org.id, actorId: user.id, area: "training", subjectId, summary });
    // Locked so two saves can't each pass the date checks against the other's old dates.
    const others = await tx
      .select({ id: trainingSessions.id, title: trainingSessions.title, heldOn: trainingSessions.heldOn, refreshesId: trainingSessions.refreshesId })
      .from(trainingSessions)
      .where(eq(trainingSessions.orgId, org.id))
      .for("update");
    if (id && !others.some((o) => o.id === id)) return null;
    const errors = refresherErrors({ id, heldOn: data.heldOn, refreshesId: data.refreshesId }, others);
    if (errors) return { errors };

    let saved: TrainingSession;
    if (id) {
      const [before] = await tx
        .select()
        .from(trainingSessions)
        .where(and(eq(trainingSessions.id, id), eq(trainingSessions.orgId, org.id)));
      [saved] = await tx.update(trainingSessions).set(data).where(eq(trainingSessions.id, id)).returning();
      const summary = editSummary(describe.training(saved), changedFields(before, data, FIELD_LABELS.training));
      if (summary) await log(id, summary);
    } else {
      [saved] = await tx
        .insert(trainingSessions)
        .values({ ...data, orgId: org.id })
        .returning();
      const earlier = others.find((o) => o.id === data.refreshesId);
      await log(saved.id, `recorded ${describe.training(saved)}${earlier ? `, the refresher for ${describe.training(earlier)}` : ""}`);
    }
    return { id: saved.id };
  });
  if (!result) return { message: "Training session not found." };
  if ("errors" in result) return { errors: result.errors, values: formValues(formData) };

  revalidatePath("/", "layout");
  redirect(`/training/${result.id}`);
}

export async function deleteTraining(id: string): Promise<void> {
  const { user, org } = await requireActiveOrg();
  if (typeof id === "string" && isUuid(id)) {
    await db.transaction(async (tx) => {
      const [gone] = await tx
        .delete(trainingSessions)
        .where(and(eq(trainingSessions.id, id), eq(trainingSessions.orgId, org.id)))
        .returning();
      if (gone) {
        await recordActivity(tx, { orgId: org.id, actorId: user.id, area: "training", subjectId: id, summary: `deleted ${describe.training(gone)}` });
      }
    });
  }
  revalidatePath("/", "layout");
  redirect("/training");
}
