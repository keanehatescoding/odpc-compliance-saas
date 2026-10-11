"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { policies, type Policy } from "@/db/schema";
import { changedFields, describe, editSummary, FIELD_LABELS, recordActivity } from "@/lib/activity";
import { todayInKenya } from "@/lib/dates";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { parsePolicyForm } from "@/lib/policy-form";
import { requireActiveOrg } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

/** Creates or updates a policy. Edits carry the record id in a hidden `id` field. */
export async function savePolicy(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireActiveOrg();
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? rawId : null;
  if (id && !isUuid(id)) return { message: "Policy not found." };
  const parsed = parsePolicyForm(formData, todayInKenya());
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData) };
  const data = parsed.data;

  const policyId = await db.transaction(async (tx) => {
    const log = (subjectId: string, summary: string) =>
      recordActivity(tx, { orgId: org.id, actorId: user.id, area: "policy", subjectId, summary });
    let saved: Policy;
    if (id) {
      const [before] = await tx
        .select()
        .from(policies)
        .where(and(eq(policies.id, id), eq(policies.orgId, org.id)))
        .for("update");
      if (!before) return null;
      [saved] = await tx
        .update(policies)
        .set(data)
        .where(and(eq(policies.id, id), eq(policies.orgId, org.id)))
        .returning();
      const summary = editSummary(describe.policy(saved), changedFields(before, data, FIELD_LABELS.policy));
      if (summary) await log(id, summary);
    } else {
      [saved] = await tx
        .insert(policies)
        .values({ ...data, orgId: org.id })
        .returning();
      await log(saved.id, `added ${describe.policy(saved)}`);
    }
    return saved.id;
  });
  if (!policyId) return { message: "Policy not found." };

  revalidatePath("/", "layout");
  redirect(`/policies/${policyId}`);
}

export async function deletePolicy(id: string): Promise<void> {
  const { user, org } = await requireActiveOrg();
  if (typeof id === "string" && isUuid(id)) {
    await db.transaction(async (tx) => {
      const [gone] = await tx
        .delete(policies)
        .where(and(eq(policies.id, id), eq(policies.orgId, org.id)))
        .returning();
      if (gone) {
        await recordActivity(tx, { orgId: org.id, actorId: user.id, area: "policy", subjectId: id, summary: `deleted ${describe.policy(gone)}` });
      }
    });
  }
  revalidatePath("/", "layout");
  redirect("/policies");
}
