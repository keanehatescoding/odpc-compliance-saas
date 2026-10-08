"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/db";
import { subjectRequestAlertLog, subjectRequests } from "@/db/schema";
import { changedFields, describe, editSummary, FIELD_LABELS, recordActivity } from "@/lib/activity";
import { formatDate, todayInKenya } from "@/lib/dates";
import { createEmailSender } from "@/lib/email";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { requireActiveOrg } from "@/lib/session";
import { runSubjectRequestAlerts } from "@/lib/subject-request-alerts";
import { REQUEST_OUTCOMES, responseDueOn, type RequestOutcome } from "@/lib/subject-request";
import { parseSubjectRequestForm } from "@/lib/subject-request-form";
import { isUuid } from "@/lib/uuid";

/** Creates or updates a data subject request. Edits carry the request id in a hidden `id` field. */
export async function saveSubjectRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireActiveOrg();
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? rawId : null;
  if (id && !isUuid(id)) return { message: "Request not found." };
  const parsed = parseSubjectRequestForm(formData, todayInKenya());
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData) };
  const data = { ...parsed.data, receivedOn: parsed.data.receivedOn! };

  const requestId = await db.transaction(async (tx) => {
    const log = (subjectId: string, summary: string) =>
      recordActivity(tx, { orgId: org.id, actorId: user.id, area: "request", subjectId, summary });
    if (!id) {
      const [saved] = await tx
        .insert(subjectRequests)
        .values({ ...data, orgId: org.id, loggedBy: user.id })
        .returning({ id: subjectRequests.id });
      await log(saved.id, `logged ${describe.request(data)}`);
      return saved.id;
    }
    const [before] = await tx
      .select()
      .from(subjectRequests)
      .where(and(eq(subjectRequests.id, id), eq(subjectRequests.orgId, org.id)))
      .for("update");
    if (!before) return null;
    await tx.update(subjectRequests).set(data).where(eq(subjectRequests.id, id));
    // Alerts sent for the old deadline say nothing about the new one.
    if (responseDueOn(before) !== responseDueOn(data)) {
      await tx.delete(subjectRequestAlertLog).where(eq(subjectRequestAlertLog.requestId, id));
    }

    let fields = changedFields(before, data, FIELD_LABELS.request);
    // Recording the response gets an entry of its own, saying what was done and when.
    if (data.outcome && !before.outcome) {
      const outcome = REQUEST_OUTCOMES[data.outcome as RequestOutcome].toLowerCase();
      await log(id, `recorded the response to ${describe.request(data)}: ${outcome} on ${formatDate(data.respondedOn)}`);
      fields = fields.filter((f) => f !== FIELD_LABELS.request.outcome && f !== FIELD_LABELS.request.respondedOn);
    }
    const summary = editSummary(describe.request(data), fields);
    if (summary) await log(id, summary);
    return id;
  });
  if (!requestId) return { message: "Request not found." };

  // A request logged close to its deadline alerts the team now, not at the next scheduled run.
  after(() => runSubjectRequestAlerts(db, createEmailSender(), { requestId }).catch((err) => console.error(err)));

  revalidatePath("/", "layout");
  redirect(`/requests/${requestId}`);
}

export async function deleteSubjectRequest(id: string): Promise<void> {
  const { user, org } = await requireActiveOrg();
  if (typeof id === "string" && isUuid(id)) {
    await db.transaction(async (tx) => {
      const [gone] = await tx
        .delete(subjectRequests)
        .where(and(eq(subjectRequests.id, id), eq(subjectRequests.orgId, org.id)))
        .returning();
      if (gone) {
        await recordActivity(tx, { orgId: org.id, actorId: user.id, area: "request", subjectId: id, summary: `deleted ${describe.request(gone)}` });
      }
    });
  }
  revalidatePath("/", "layout");
  redirect("/requests");
}
