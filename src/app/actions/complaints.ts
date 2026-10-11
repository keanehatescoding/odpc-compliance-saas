"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/db";
import { complaintAlertLog, complaints } from "@/db/schema";
import { changedFields, describe, editSummary, FIELD_LABELS, recordActivity } from "@/lib/activity";
import { dueOnAfterEdit } from "@/lib/complaint";
import { runComplaintAlerts } from "@/lib/complaint-alerts";
import { parseComplaintForm } from "@/lib/complaint-form";
import { formatDate, todayInKenya } from "@/lib/dates";
import { createEmailSender } from "@/lib/email";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { requireActiveOrg } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

/** Creates or updates an ODPC complaint or notice. Edits carry its id in a hidden `id` field. */
export async function saveComplaint(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireActiveOrg();
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? rawId : null;
  if (id && !isUuid(id)) return { message: "Complaint not found." };
  const parsed = parseComplaintForm(formData, todayInKenya());
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData) };
  const data = parsed.data;

  const complaintId = await db.transaction(async (tx) => {
    const log = (subjectId: string, summary: string) =>
      recordActivity(tx, { orgId: org.id, actorId: user.id, area: "complaint", subjectId, summary });
    if (!id) {
      const [saved] = await tx
        .insert(complaints)
        .values({ ...data, orgId: org.id, loggedBy: user.id })
        .returning({ id: complaints.id });
      await log(saved.id, `logged ${describe.complaint(data)}`);
      return saved.id;
    }
    const [before] = await tx
      .select()
      .from(complaints)
      .where(and(eq(complaints.id, id), eq(complaints.orgId, org.id)))
      .for("update");
    if (!before) return null;
    data.dueOn = dueOnAfterEdit(before, data);
    await tx
      .update(complaints)
      .set(data)
      .where(and(eq(complaints.id, id), eq(complaints.orgId, org.id)));
    // Alerts sent for the old deadline say nothing about the new one.
    if (before.dueOn !== data.dueOn) {
      await tx.delete(complaintAlertLog).where(eq(complaintAlertLog.complaintId, id));
    }

    let fields = changedFields(before, data, FIELD_LABELS.complaint);
    // Responding and the ODPC closing it each get an entry of their own, saying when.
    if (data.respondedOn && !before.respondedOn) {
      await log(id, `recorded the response to ${describe.complaint(data)}, sent on ${formatDate(data.respondedOn)}`);
      fields = fields.filter((f) => f !== FIELD_LABELS.complaint.respondedOn && f !== FIELD_LABELS.complaint.response);
    }
    if (data.closedOn && !before.closedOn) {
      await log(id, `closed ${describe.complaint(data)} on ${formatDate(data.closedOn)}`);
      fields = fields.filter((f) => f !== FIELD_LABELS.complaint.closedOn && f !== FIELD_LABELS.complaint.outcome);
    }
    const summary = editSummary(describe.complaint(data), fields);
    if (summary) await log(id, summary);
    return id;
  });
  if (!complaintId) return { message: "Complaint not found." };

  // One logged close to its deadline alerts the team now, not at the next scheduled run.
  after(() => runComplaintAlerts(db, createEmailSender(), { complaintId }).catch((err) => console.error(err)));

  revalidatePath("/", "layout");
  redirect(`/complaints/${complaintId}`);
}

export async function deleteComplaint(id: string): Promise<void> {
  const { user, org } = await requireActiveOrg();
  if (typeof id === "string" && isUuid(id)) {
    await db.transaction(async (tx) => {
      const [gone] = await tx
        .delete(complaints)
        .where(and(eq(complaints.id, id), eq(complaints.orgId, org.id)))
        .returning();
      if (gone) {
        await recordActivity(tx, { orgId: org.id, actorId: user.id, area: "complaint", subjectId: id, summary: `deleted ${describe.complaint(gone)}` });
      }
    });
  }
  revalidatePath("/", "layout");
  redirect("/complaints");
}
