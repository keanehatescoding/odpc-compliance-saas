"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { processingActivities } from "@/db/schema";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { ACTIVITY_TEMPLATES, parseActivityForm } from "@/lib/ropa";
import { requireActiveOrg } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

/** Creates or updates a RoPA entry. Edits carry the activity id in a hidden `id` field. */
export async function saveActivity(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org } = await requireActiveOrg();
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? rawId : null;
  if (id && !isUuid(id)) return { message: "Activity not found." };
  const parsed = parseActivityForm(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData) };

  const data = {
    ...parsed.data,
    transferCountries: parsed.data.crossBorder ? parsed.data.transferCountries : "",
    transferSafeguards: parsed.data.crossBorder ? parsed.data.transferSafeguards : "",
  };
  if (id) {
    const updated = await db
      .update(processingActivities)
      .set(data)
      .where(and(eq(processingActivities.id, id), eq(processingActivities.orgId, org.id)))
      .returning({ id: processingActivities.id });
    if (updated.length === 0) return { message: "Activity not found." };
  } else {
    await db.insert(processingActivities).values({ ...data, orgId: org.id });
  }

  revalidatePath("/", "layout");
  redirect("/ropa");
}

export async function deleteActivity(id: string): Promise<void> {
  const { org } = await requireActiveOrg();
  if (typeof id === "string" && isUuid(id)) {
    await db
      .delete(processingActivities)
      .where(and(eq(processingActivities.id, id), eq(processingActivities.orgId, org.id)));
  }
  revalidatePath("/", "layout");
  redirect("/ropa");
}

/** Adds the selected sector templates to the organisation's RoPA, skipping any already added. */
export async function addTemplates(formData: FormData): Promise<void> {
  const { org } = await requireActiveOrg();
  const ids = new Set(formData.getAll("templateId").map(String));
  const chosen = ACTIVITY_TEMPLATES.filter((t) => ids.has(t.id));
  if (chosen.length > 0) {
    const existing = await db
      .select({ templateId: processingActivities.templateId })
      .from(processingActivities)
      .where(
        and(
          eq(processingActivities.orgId, org.id),
          inArray(
            processingActivities.templateId,
            chosen.map((t) => t.id),
          ),
        ),
      );
    const have = new Set(existing.map((e) => e.templateId));
    const rows = chosen
      .filter((t) => !have.has(t.id))
      .map(({ id, sectors: _sectors, ...t }) => ({ ...t, orgId: org.id, templateId: id }));
    // The unique (org_id, template_id) index makes concurrent submissions safe.
    if (rows.length > 0) await db.insert(processingActivities).values(rows).onConflictDoNothing();
  }
  revalidatePath("/", "layout");
  redirect("/ropa");
}
