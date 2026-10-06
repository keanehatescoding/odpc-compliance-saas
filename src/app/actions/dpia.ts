"use server";

import { and, asc, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { dpiaRisks, dpias, processingActivities } from "@/db/schema";
import { changedFields, describe, editSummary, FIELD_LABELS, recordActivity } from "@/lib/activity";
import { formatDate } from "@/lib/dates";
import { isUniqueViolation } from "@/lib/db-errors";
import { draftDpia, getDpiaTemplate, type RiskInput } from "@/lib/dpia";
import { parseDpiaForm } from "@/lib/dpia-form";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { requireActiveOrg } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

const ACTIVITY_TAKEN = "That activity already has its own DPIA.";

const riskRows = (dpiaId: string, risks: RiskInput[]) => risks.map((r, position) => ({ ...r, dpiaId, position }));

/** The risk table's content, in order, for telling whether a save changed it. */
const riskTable = (risks: RiskInput[]) =>
  risks.map((r) => [r.description, r.likelihood, r.severity, r.mitigation, r.residualLikelihood, r.residualSeverity]);

/**
 * Starts a draft DPIA, from a RoPA activity, a template, or blank, and opens
 * it. An activity that already has a DPIA opens the existing one.
 */
export async function startDpia(formData: FormData): Promise<void> {
  const { user, org } = await requireActiveOrg();
  const rawActivity = String(formData.get("activityId") ?? "");
  const template = getDpiaTemplate(String(formData.get("templateId") ?? ""));

  let activity = null;
  if (rawActivity) {
    if (!isUuid(rawActivity)) redirect("/dpia");
    [activity] = await db
      .select()
      .from(processingActivities)
      .where(and(eq(processingActivities.id, rawActivity), eq(processingActivities.orgId, org.id)))
      .limit(1);
    if (!activity) redirect("/dpia");
  }

  const draft = draftDpia(activity, template);
  const id = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(dpias)
      .values({
        orgId: org.id,
        activityId: activity?.id ?? null,
        title: draft.title,
        templateId: draft.templateId,
        description: draft.description,
        purposes: draft.purposes,
        necessity: draft.necessity,
        assessor: user.name,
        createdBy: user.id,
      })
      // The unique activity index makes a double submit open the same DPIA.
      .onConflictDoNothing()
      .returning({ id: dpias.id, title: dpias.title });
    if (!created) return null;
    if (draft.risks.length > 0) await tx.insert(dpiaRisks).values(riskRows(created.id, draft.risks));
    await recordActivity(tx, { orgId: org.id, actorId: user.id, area: "dpia", subjectId: created.id, summary: `started ${describe.dpia(created)}` });
    return created.id;
  });

  if (id) {
    revalidatePath("/", "layout");
    redirect(`/dpia/${id}`);
  }
  const [existing] = await db
    .select({ id: dpias.id })
    .from(dpias)
    .where(and(eq(dpias.orgId, org.id), eq(dpias.activityId, activity!.id)))
    .limit(1);
  redirect(existing ? `/dpia/${existing.id}` : "/dpia");
}

/** Saves an existing DPIA and replaces its risk table. */
export async function saveDpia(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireActiveOrg();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { message: "DPIA not found." };
  const parsed = parseDpiaForm(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData) };
  const { risks, ...data } = parsed.data;

  const rawActivity = String(formData.get("activityId") ?? "");
  let activityId: string | null = null;
  if (rawActivity) {
    const [activity] = isUuid(rawActivity)
      ? await db
          .select({ id: processingActivities.id })
          .from(processingActivities)
          .where(and(eq(processingActivities.id, rawActivity), eq(processingActivities.orgId, org.id)))
          .limit(1)
      : [];
    if (!activity) return { errors: { activityId: ["Choose an activity from your RoPA."] }, values: formValues(formData) };
    const [taken] = await db
      .select({ id: dpias.id })
      .from(dpias)
      .where(and(eq(dpias.activityId, activity.id), ne(dpias.id, id)))
      .limit(1);
    if (taken) return { errors: { activityId: [ACTIVITY_TAKEN] }, values: formValues(formData) };
    activityId = activity.id;
  }

  let saved: boolean;
  try {
    saved = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(dpias)
        .where(and(eq(dpias.id, id), eq(dpias.orgId, org.id)))
        .for("update");
      if (!before) return false;
      const oldRisks = await tx.select().from(dpiaRisks).where(eq(dpiaRisks.dpiaId, id)).orderBy(asc(dpiaRisks.position));
      const after = { ...data, activityId };
      await tx.update(dpias).set(after).where(eq(dpias.id, id));
      await tx.delete(dpiaRisks).where(eq(dpiaRisks.dpiaId, id));
      if (risks.length > 0) await tx.insert(dpiaRisks).values(riskRows(id, risks));

      const log = (summary: string) => recordActivity(tx, { orgId: org.id, actorId: user.id, area: "dpia", subjectId: id, summary });
      let fields = changedFields(
        { ...before, risks: riskTable(oldRisks as RiskInput[]) },
        { ...after, risks: riskTable(risks) },
        FIELD_LABELS.dpia,
      );
      // Recording an approval gets an entry of its own, saying who approved it and when.
      if (after.approvedOn && !before.approvedOn) {
        const by = after.approvedBy ? ` by ${after.approvedBy}` : "";
        await log(`recorded ${describe.dpia(after)} as approved${by} on ${formatDate(after.approvedOn)}`);
        fields = fields.filter((f) => f !== FIELD_LABELS.dpia.approvedOn && f !== FIELD_LABELS.dpia.approvedBy);
      }
      const summary = editSummary(describe.dpia(after), fields);
      if (summary) await log(summary);
      return true;
    });
  } catch (err) {
    // Another save linked the same activity between the check above and this update.
    if (isUniqueViolation(err)) return { errors: { activityId: [ACTIVITY_TAKEN] }, values: formValues(formData) };
    throw err;
  }
  if (!saved) return { message: "DPIA not found." };

  revalidatePath("/", "layout");
  redirect(`/dpia/${id}?saved=1`);
}

export async function deleteDpia(id: string): Promise<void> {
  const { user, org } = await requireActiveOrg();
  if (typeof id === "string" && isUuid(id)) {
    await db.transaction(async (tx) => {
      const [gone] = await tx.delete(dpias).where(and(eq(dpias.id, id), eq(dpias.orgId, org.id))).returning();
      if (gone) {
        await recordActivity(tx, { orgId: org.id, actorId: user.id, area: "dpia", subjectId: id, summary: `deleted ${describe.dpia(gone)}` });
      }
    });
  }
  revalidatePath("/", "layout");
  redirect("/dpia");
}
