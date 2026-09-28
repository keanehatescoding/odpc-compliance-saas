"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { ORG_SIZE_KEYS, SECTOR_KEYS, type OrgSize, type Sector } from "@/lib/dpa";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { requireOrgContext } from "@/lib/session";

const schema = z.object({
  name: z.string().trim().min(2, { error: "Enter your organisation's name." }).max(200),
  sector: z.enum(SECTOR_KEYS as [Sector, ...Sector[]]),
  size: z.enum(ORG_SIZE_KEYS as [OrgSize, ...OrgSize[]]),
  kraPin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[AP]\d{9}[A-Z]$/.test(v), { error: "KRA PINs look like A123456789B." })
    .transform((v) => v || null),
  reminderEmail: z
    .string()
    .trim()
    .refine(
      (v) =>
        v === "" ||
        v
          .split(",")
          .map((s) => s.trim())
          .every((s) => z.email().safeParse(s).success),
      { error: "Enter one or more email addresses separated by commas." },
    )
    .transform((v) => v || null),
});

export async function updateOrganization(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org, role } = await requireOrgContext();
  const values = formValues(formData);
  if (role === "member") return { message: "Only owners and admins can change organisation settings.", values };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  await db.update(organizations).set(parsed.data).where(eq(organizations.id, org.id));
  revalidatePath("/", "layout");
  return { message: "Saved.", values };
}
