"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/db";
import { subjectRequestAlertLog, subjectRequests } from "@/db/schema";
import { todayInKenya } from "@/lib/dates";
import { createEmailSender } from "@/lib/email";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { requireOrgContext } from "@/lib/session";
import { runSubjectRequestAlerts } from "@/lib/subject-request-alerts";
import { responseDueOn } from "@/lib/subject-request";
import { parseSubjectRequestForm } from "@/lib/subject-request-form";
import { isUuid } from "@/lib/uuid";

/** Creates or updates a data subject request. Edits carry the request id in a hidden `id` field. */
export async function saveSubjectRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireOrgContext();
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? rawId : null;
  if (id && !isUuid(id)) return { message: "Request not found." };
  const parsed = parseSubjectRequestForm(formData, todayInKenya());
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData) };
  const data = { ...parsed.data, receivedOn: parsed.data.receivedOn! };

  let requestId: string | null;
  if (id) {
    requestId = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ kind: subjectRequests.kind, receivedOn: subjectRequests.receivedOn })
        .from(subjectRequests)
        .where(and(eq(subjectRequests.id, id), eq(subjectRequests.orgId, org.id)))
        .for("update");
      if (!before) return null;
      await tx.update(subjectRequests).set(data).where(eq(subjectRequests.id, id));
      // Alerts sent for the old deadline say nothing about the new one.
      if (responseDueOn(before) !== responseDueOn(data)) {
        await tx.delete(subjectRequestAlertLog).where(eq(subjectRequestAlertLog.requestId, id));
      }
      return id;
    });
  } else {
    const [saved] = await db
      .insert(subjectRequests)
      .values({ ...data, orgId: org.id, loggedBy: user.id })
      .returning({ id: subjectRequests.id });
    requestId = saved.id;
  }
  if (!requestId) return { message: "Request not found." };

  // A request logged close to its deadline alerts the team now, not at the next scheduled run.
  after(() => runSubjectRequestAlerts(db, createEmailSender(), { requestId }).catch((err) => console.error(err)));

  revalidatePath("/", "layout");
  redirect(`/requests/${requestId}`);
}

export async function deleteSubjectRequest(id: string): Promise<void> {
  const { org } = await requireOrgContext();
  if (typeof id === "string" && isUuid(id)) {
    await db.delete(subjectRequests).where(and(eq(subjectRequests.id, id), eq(subjectRequests.orgId, org.id)));
  }
  revalidatePath("/", "layout");
  redirect("/requests");
}
