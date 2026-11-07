"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/db";
import { particularChangeAlertLog, particularChanges } from "@/db/schema";
import { changedFields, describe, editSummary, FIELD_LABELS, recordActivity } from "@/lib/activity";
import { formatDate, todayInKenya } from "@/lib/dates";
import { createEmailSender } from "@/lib/email";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { runParticularChangeAlerts } from "@/lib/particulars-alerts";
import { parseParticularChangeForm } from "@/lib/particulars-form";
import { requireActiveOrg } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

/** Creates or updates a change of registered particulars. Edits carry its id in a hidden `id` field. */
export async function saveParticularChange(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireActiveOrg();
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? rawId : null;
  if (id && !isUuid(id)) return { message: "Change not found." };
  const parsed = parseParticularChangeForm(formData, todayInKenya());
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData) };
  const data = parsed.data;

  const changeId = await db.transaction(async (tx) => {
    const log = (subjectId: string, summary: string) =>
      recordActivity(tx, { orgId: org.id, actorId: user.id, area: "particulars", subjectId, summary });
    if (!id) {
      const [saved] = await tx
        .insert(particularChanges)
        .values({ ...data, orgId: org.id, loggedBy: user.id })
        .returning({ id: particularChanges.id });
      await log(saved.id, `logged ${describe.particulars(data)}`);
      if (data.notifiedOn) await log(saved.id, `recorded notifying the ODPC on ${formatDate(data.notifiedOn)}`);
      return saved.id;
    }
    const [before] = await tx
      .select()
      .from(particularChanges)
      .where(and(eq(particularChanges.id, id), eq(particularChanges.orgId, org.id)))
      .for("update");
    if (!before) return null;
    // A form opened before someone else saved would put back what they changed,
    // such as erasing the date they recorded notifying the ODPC.
    if (formData.get("updatedAt") !== before.updatedAt.toISOString()) return "stale" as const;
    await tx
      .update(particularChanges)
      .set(data)
      .where(and(eq(particularChanges.id, id), eq(particularChanges.orgId, org.id)));
    // Alerts sent for the old deadline say nothing about the new one.
    if (before.changedOn !== data.changedOn) {
      await tx.delete(particularChangeAlertLog).where(eq(particularChangeAlertLog.changeId, id));
    }

    let fields = changedFields(before, data, FIELD_LABELS.particulars);
    // Notifying the ODPC gets an entry of its own, saying when.
    if (data.notifiedOn && !before.notifiedOn) {
      await log(id, `recorded notifying the ODPC of ${describe.particulars(data)} on ${formatDate(data.notifiedOn)}`);
      fields = fields.filter((f) => f !== FIELD_LABELS.particulars.notifiedOn && f !== FIELD_LABELS.particulars.notifiedHow);
    }
    const summary = editSummary(describe.particulars(data), fields);
    if (summary) await log(id, summary);
    return id;
  });
  if (!changeId) return { message: "Change not found." };
  if (changeId === "stale") {
    return {
      message: "Someone else changed this since you opened it. Reload the page to see their changes, then make yours again.",
      values: formValues(formData),
    };
  }

  // One logged close to its deadline alerts the team now, not at the next scheduled run.
  after(() => runParticularChangeAlerts(db, createEmailSender(), { changeId }).catch((err) => console.error(err)));

  revalidatePath("/", "layout");
  redirect(`/registrations/changes/${changeId}`);
}

export async function deleteParticularChange(id: string): Promise<void> {
  const { user, org } = await requireActiveOrg();
  if (typeof id === "string" && isUuid(id)) {
    await db.transaction(async (tx) => {
      const [gone] = await tx
        .delete(particularChanges)
        .where(and(eq(particularChanges.id, id), eq(particularChanges.orgId, org.id)))
        .returning();
      if (gone) {
        await recordActivity(tx, {
          orgId: org.id,
          actorId: user.id,
          area: "particulars",
          subjectId: id,
          summary: `deleted ${describe.particulars(gone)}`,
        });
      }
    });
  }
  revalidatePath("/", "layout");
  redirect("/registrations");
}
