"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { registrations } from "@/db/schema";
import { changedFields, describe, editSummary, FIELD_LABELS, recordActivity } from "@/lib/activity";
import { isIsoDate } from "@/lib/dates";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { defaultExpiry } from "@/lib/registration";
import { requireActiveOrg } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

const optionalDate = z
  .string()
  .trim()
  .transform((v) => v || null)
  .refine((v) => v === null || isIsoDate(v), { error: "Enter a valid date." });

const schema = z
  .object({
    role: z.enum(["controller", "processor"], { error: "Choose controller or processor." }),
    certificateNumber: z
      .string()
      .trim()
      .max(100)
      .transform((v) => v || null),
    appliedOn: optionalDate,
    issuedOn: optionalDate,
    expiresOn: optionalDate,
    notes: z.string().trim().max(2000).default(""),
  })
  .transform((v) => ({ ...v, expiresOn: v.expiresOn ?? (v.issuedOn ? defaultExpiry(v.issuedOn) : null) }))
  .superRefine((v, ctx) => {
    if (v.issuedOn && v.expiresOn && v.expiresOn <= v.issuedOn) {
      ctx.addIssue({ code: "custom", path: ["expiresOn"], message: "Expiry must be after the issue date." });
    }
    if (v.expiresOn && !v.issuedOn) {
      ctx.addIssue({ code: "custom", path: ["issuedOn"], message: "Enter the issue date shown on the certificate." });
    }
  });

/** Creates or updates a registration. Edits carry the registration id in a hidden `id` field. */
export async function saveRegistration(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireActiveOrg();
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? rawId : null;
  if (id && !isUuid(id)) return { message: "Registration not found." };
  const values = formValues(formData);
  const parsed = schema.safeParse({
    role: formData.get("role"),
    certificateNumber: formData.get("certificateNumber") ?? "",
    appliedOn: formData.get("appliedOn") ?? "",
    issuedOn: formData.get("issuedOn") ?? "",
    expiresOn: formData.get("expiresOn") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const [clash] = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(
      and(
        eq(registrations.orgId, org.id),
        eq(registrations.role, parsed.data.role),
        id ? ne(registrations.id, id) : undefined,
      ),
    )
    .limit(1);
  if (clash) {
    return {
      errors: { role: [`You already track a ${parsed.data.role} registration. Edit that one instead.`] },
      values,
    };
  }

  const saved = await db.transaction(async (tx) => {
    if (!id) {
      const [created] = await tx.insert(registrations).values({ ...parsed.data, orgId: org.id }).returning();
      await recordActivity(tx, { orgId: org.id, actorId: user.id, area: "registration", subjectId: created.id, summary: `added ${describe.registration(created)}` });
      return true;
    }
    const [before] = await tx
      .select()
      .from(registrations)
      .where(and(eq(registrations.id, id), eq(registrations.orgId, org.id)))
      .for("update");
    if (!before) return false;
    await tx.update(registrations).set(parsed.data).where(eq(registrations.id, id));
    const summary = editSummary(describe.registration(parsed.data), changedFields(before, parsed.data, FIELD_LABELS.registration));
    if (summary) await recordActivity(tx, { orgId: org.id, actorId: user.id, area: "registration", subjectId: id, summary });
    return true;
  });
  if (!saved) return { message: "Registration not found." };

  revalidatePath("/", "layout");
  redirect("/registrations");
}

export async function deleteRegistration(id: string): Promise<void> {
  const { user, org } = await requireActiveOrg();
  if (typeof id === "string" && isUuid(id)) {
    await db.transaction(async (tx) => {
      const [gone] = await tx
        .delete(registrations)
        .where(and(eq(registrations.id, id), eq(registrations.orgId, org.id)))
        .returning();
      if (gone) {
        await recordActivity(tx, { orgId: org.id, actorId: user.id, area: "registration", subjectId: id, summary: `deleted ${describe.registration(gone)}` });
      }
    });
  }
  revalidatePath("/", "layout");
  redirect("/registrations");
}
