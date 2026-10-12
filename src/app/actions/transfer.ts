"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { transfers, processingActivities, type Transfer } from "@/db/schema";
import { changedFields, describe, editSummary, FIELD_LABELS, recordActivity } from "@/lib/activity";
import { parseTransferForm } from "@/lib/transfer-form";
import { todayInKenya } from "@/lib/dates";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { requireActiveOrg } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

/** Creates or updates a transfer outside Kenya. Edits carry the record id in a hidden `id` field. */
export async function saveTransfer(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireActiveOrg();
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? rawId : null;
  if (id && !isUuid(id)) return { message: "Transfer not found." };
  const parsed = parseTransferForm(formData, todayInKenya());
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData) };
  const data = parsed.data;

  // Only link an activity that belongs to this organisation.
  const [activity] = await db
    .select({ id: processingActivities.id })
    .from(processingActivities)
    .where(and(eq(processingActivities.orgId, org.id), eq(processingActivities.id, data.activityId)))
    .limit(1);
  if (!activity) {
    return { errors: { activityId: ["Choose the processing activity this transfer is part of."] }, values: formValues(formData) };
  }

  const transferId = await db.transaction(async (tx) => {
    const log = (subjectId: string, summary: string) =>
      recordActivity(tx, { orgId: org.id, actorId: user.id, area: "transfer", subjectId, summary });
    let saved: Transfer;
    if (id) {
      const [before] = await tx
        .select()
        .from(transfers)
        .where(and(eq(transfers.id, id), eq(transfers.orgId, org.id)))
        .for("update");
      if (!before) return null;
      [saved] = await tx
        .update(transfers)
        .set(data)
        .where(and(eq(transfers.id, id), eq(transfers.orgId, org.id)))
        .returning();
      const summary = editSummary(describe.transfer(saved), changedFields(before, data, FIELD_LABELS.transfer));
      if (summary) await log(id, summary);
    } else {
      [saved] = await tx
        .insert(transfers)
        .values({ ...data, orgId: org.id })
        .returning();
      await log(saved.id, `added ${describe.transfer(saved)}`);
    }
    return saved.id;
  });
  if (!transferId) return { message: "Transfer not found." };

  revalidatePath("/", "layout");
  redirect(`/transfers/${transferId}`);
}

export async function deleteTransfer(id: string): Promise<void> {
  const { user, org } = await requireActiveOrg();
  if (typeof id === "string" && isUuid(id)) {
    await db.transaction(async (tx) => {
      const [gone] = await tx
        .delete(transfers)
        .where(and(eq(transfers.id, id), eq(transfers.orgId, org.id)))
        .returning();
      if (gone) {
        await recordActivity(tx, { orgId: org.id, actorId: user.id, area: "transfer", subjectId: id, summary: `deleted ${describe.transfer(gone)}` });
      }
    });
  }
  revalidatePath("/", "layout");
  redirect("/transfers");
}
