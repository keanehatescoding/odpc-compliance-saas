"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { registrations } from "@/db/schema";
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
  const { org } = await requireActiveOrg();
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

  if (id) {
    const updated = await db
      .update(registrations)
      .set(parsed.data)
      .where(and(eq(registrations.id, id), eq(registrations.orgId, org.id)))
      .returning({ id: registrations.id });
    if (updated.length === 0) return { message: "Registration not found." };
  } else {
    await db.insert(registrations).values({ ...parsed.data, orgId: org.id });
  }

  revalidatePath("/", "layout");
  redirect("/registrations");
}

export async function deleteRegistration(id: string): Promise<void> {
  const { org } = await requireActiveOrg();
  if (typeof id === "string" && isUuid(id)) {
    await db.delete(registrations).where(and(eq(registrations.id, id), eq(registrations.orgId, org.id)));
  }
  revalidatePath("/", "layout");
  redirect("/registrations");
}
