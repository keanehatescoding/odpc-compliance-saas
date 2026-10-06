"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { processingActivities } from "@/db/schema";
import { changedFields, describe, editSummary, FIELD_LABELS, recordActivity } from "@/lib/activity";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { ACTIVITY_TEMPLATES, parseActivityForm } from "@/lib/ropa";
import { requireActiveOrg } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

/** Creates or updates a RoPA entry. Edits carry the activity id in a hidden `id` field. */
export async function saveActivity(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireActiveOrg();
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
  const saved = await db.transaction(async (tx) => {
    const log = (subjectId: string, summary: string) =>
      recordActivity(tx, { orgId: org.id, actorId: user.id, area: "ropa", subjectId, summary });
    if (!id) {
      const [created] = await tx.insert(processingActivities).values({ ...data, orgId: org.id }).returning();
      await log(created.id, `added ${describe.ropa(created)}`);
      return true;
    }
    const [before] = await tx
      .select()
      .from(processingActivities)
      .where(and(eq(processingActivities.id, id), eq(processingActivities.orgId, org.id)))
      .for("update");
    if (!before) return false;
    await tx.update(processingActivities).set(data).where(eq(processingActivities.id, id));
    const summary = editSummary(describe.ropa(data), changedFields(before, data, FIELD_LABELS.ropa));
    if (summary) await log(id, summary);
    return true;
  });
  if (!saved) return { message: "Activity not found." };

  revalidatePath("/", "layout");
  redirect("/ropa");
}

export async function deleteActivity(id: string): Promise<void> {
  const { user, org } = await requireActiveOrg();
  if (typeof id === "string" && isUuid(id)) {
    await db.transaction(async (tx) => {
      const [gone] = await tx
        .delete(processingActivities)
        .where(and(eq(processingActivities.id, id), eq(processingActivities.orgId, org.id)))
        .returning();
      if (gone) {
        await recordActivity(tx, { orgId: org.id, actorId: user.id, area: "ropa", subjectId: id, summary: `deleted ${describe.ropa(gone)}` });
      }
    });
  }
  revalidatePath("/", "layout");
  redirect("/ropa");
}

/** Adds the selected sector templates to the organisation's RoPA, skipping any already added. */
export async function addTemplates(formData: FormData): Promise<void> {
  const { user, org } = await requireActiveOrg();
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
    if (rows.length > 0) {
      await db.transaction(async (tx) => {
        const added = await tx.insert(processingActivities).values(rows).onConflictDoNothing().returning();
        await recordActivity(
          tx,
          added.map((a) => ({
            orgId: org.id,
            actorId: user.id,
            area: "ropa" as const,
            subjectId: a.id,
            summary: `added ${describe.ropa(a)} from a sector template`,
          })),
        );
      });
    }
  }
  revalidatePath("/", "layout");
  redirect("/ropa");
}
