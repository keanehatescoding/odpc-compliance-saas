"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { consentRecords, processingActivities, type ConsentRecord } from "@/db/schema";
import { changedFields, describe, editSummary, FIELD_LABELS, recordActivity } from "@/lib/activity";
import { parseConsentForm } from "@/lib/consent-form";
import { todayInKenya } from "@/lib/dates";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { requireActiveOrg } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

/** Creates or updates a consent record. Edits carry the record id in a hidden `id` field. */
export async function saveConsent(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireActiveOrg();
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? rawId : null;
  if (id && !isUuid(id)) return { message: "Consent record not found." };
  const parsed = parseConsentForm(formData, todayInKenya());
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData) };
  const data = parsed.data;

  // Only link an activity that belongs to this organisation.
  const [activity] = await db
    .select({ id: processingActivities.id })
    .from(processingActivities)
    .where(and(eq(processingActivities.orgId, org.id), eq(processingActivities.id, data.activityId)))
    .limit(1);
  if (!activity) {
    return { errors: { activityId: ["Choose the processing activity that relies on this consent."] }, values: formValues(formData) };
  }

  const consentId = await db.transaction(async (tx) => {
    const log = (subjectId: string, summary: string) =>
      recordActivity(tx, { orgId: org.id, actorId: user.id, area: "consent", subjectId, summary });
    let saved: ConsentRecord;
    if (id) {
      const [before] = await tx
        .select()
        .from(consentRecords)
        .where(and(eq(consentRecords.id, id), eq(consentRecords.orgId, org.id)))
        .for("update");
      if (!before) return null;
      [saved] = await tx.update(consentRecords).set(data).where(eq(consentRecords.id, id)).returning();
      const summary = editSummary(describe.consent(saved), changedFields(before, data, FIELD_LABELS.consent));
      if (summary) await log(id, summary);
    } else {
      [saved] = await tx
        .insert(consentRecords)
        .values({ ...data, orgId: org.id })
        .returning();
      await log(saved.id, `added ${describe.consent(saved)}`);
    }
    return saved.id;
  });
  if (!consentId) return { message: "Consent record not found." };

  revalidatePath("/", "layout");
  redirect(`/consents/${consentId}`);
}

export async function deleteConsent(id: string): Promise<void> {
  const { user, org } = await requireActiveOrg();
  if (typeof id === "string" && isUuid(id)) {
    await db.transaction(async (tx) => {
      const [gone] = await tx
        .delete(consentRecords)
        .where(and(eq(consentRecords.id, id), eq(consentRecords.orgId, org.id)))
        .returning();
      if (gone) {
        await recordActivity(tx, { orgId: org.id, actorId: user.id, area: "consent", subjectId: id, summary: `deleted ${describe.consent(gone)}` });
      }
    });
  }
  revalidatePath("/", "layout");
  redirect("/consents");
}
