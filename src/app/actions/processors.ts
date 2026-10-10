"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { processingActivities, processorActivities, processors, type Processor } from "@/db/schema";
import { changedFields, describe, editSummary, FIELD_LABELS, recordActivity } from "@/lib/activity";
import { formatDate, todayInKenya } from "@/lib/dates";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { parseProcessorForm } from "@/lib/processor-form";
import { requireActiveOrg } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

/** Creates or updates a processor. Edits carry the processor id in a hidden `id` field. */
export async function saveProcessor(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireActiveOrg();
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? rawId : null;
  if (id && !isUuid(id)) return { message: "Processor not found." };
  const parsed = parseProcessorForm(formData, todayInKenya());
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData) };
  const data = parsed.data;

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

  const processorId = await db.transaction(async (tx) => {
    const log = (subjectId: string, summary: string) =>
      recordActivity(tx, { orgId: org.id, actorId: user.id, area: "processor", subjectId, summary });
    let saved: Processor;
    if (id) {
      const [before] = await tx
        .select()
        .from(processors)
        .where(and(eq(processors.id, id), eq(processors.orgId, org.id)))
        .for("update");
      if (!before) return null;
      const linked = await tx.delete(processorActivities).where(eq(processorActivities.processorId, id)).returning();
      [saved] = await tx.update(processors).set(data).where(eq(processors.id, id)).returning();

      let fields = changedFields(
        { ...before, activityIds: linked.map((l) => l.activityId).sort() },
        { ...data, activityIds: [...activityIds].sort() },
        FIELD_LABELS.processor,
      );
      // Signing the contract gets an entry of its own, saying when.
      if (data.contractSignedOn && !before.contractSignedOn) {
        await log(id, `recorded a written contract with ${describe.processor(saved)}, signed ${formatDate(data.contractSignedOn)}`);
        fields = fields.filter((f) => f !== FIELD_LABELS.processor.contractSignedOn);
      }
      const summary = editSummary(describe.processor(saved), fields);
      if (summary) await log(id, summary);
    } else {
      [saved] = await tx
        .insert(processors)
        .values({ ...data, orgId: org.id })
        .returning();
      await log(saved.id, `added ${describe.processor(saved)}`);
    }
    if (activityIds.length > 0) {
      await tx.insert(processorActivities).values(activityIds.map((activityId) => ({ processorId: saved.id, activityId })));
    }
    return saved.id;
  });
  if (!processorId) return { message: "Processor not found." };

  revalidatePath("/", "layout");
  redirect(`/processors/${processorId}`);
}

export async function deleteProcessor(id: string): Promise<void> {
  const { user, org } = await requireActiveOrg();
  if (typeof id === "string" && isUuid(id)) {
    await db.transaction(async (tx) => {
      const [gone] = await tx
        .delete(processors)
        .where(and(eq(processors.id, id), eq(processors.orgId, org.id)))
        .returning();
      if (gone) {
        await recordActivity(tx, { orgId: org.id, actorId: user.id, area: "processor", subjectId: id, summary: `deleted ${describe.processor(gone)}` });
      }
    });
  }
  revalidatePath("/", "layout");
  redirect("/processors");
}
