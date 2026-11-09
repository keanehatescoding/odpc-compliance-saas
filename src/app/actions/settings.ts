"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { organizations, registrations } from "@/db/schema";
import { changedFields, editSummary, FIELD_LABELS, recordActivity } from "@/lib/activity";
import { isIsoDate, todayInKenya } from "@/lib/dates";
import { nextDpoDetailsChangedOn } from "@/lib/dpo";
import { ORG_SIZE_KEYS, SECTOR_KEYS, type OrgSize, type Sector } from "@/lib/dpa";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { organizationParticularChange, suggestionFor, type SuggestedChange } from "@/lib/particulars";
import { requireOrgContext } from "@/lib/session";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const optionalEmail = z
  .string()
  .trim()
  .refine((v) => v === "" || z.email().safeParse(v).success, { error: "Enter an email address." })
  .transform((v) => v || null);

const pastDate = z
  .string()
  .trim()
  .transform((v) => v || null)
  .refine((v) => v === null || isIsoDate(v), { error: "Enter a valid date." })
  .refine((v) => v === null || v <= todayInKenya(), { error: "This can't be in the future." });

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
  privacyContact: optionalText(200),
  privacyEmail: optionalEmail,
  privacyPhone: optionalText(50),
  address: optionalText(500),
  dpoDesignated: z.enum(["", "yes", "no"]).transform((v) => (v === "" ? null : v === "yes")),
  dpoName: optionalText(200),
  dpoEmail: optionalEmail,
  dpoPhone: optionalText(50),
  dpoAppointedOn: pastDate,
  dpoNotifiedOn: pastDate,
});

export type SettingsState =
  | (NonNullable<FormState> & {
      /** Set when the edit may have changed what the ODPC's register holds. */
      particulars?: SuggestedChange;
    })
  | undefined;

export async function updateOrganization(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { user, org, role } = await requireOrgContext();
  const values = formValues(formData);
  if (role === "member") return { message: "Only owners and admins can change organisation settings.", values };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const particulars = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(organizations).where(eq(organizations.id, org.id)).for("update");
    // Deleting the organisation erases contact details under this same lock; a save queued behind it mustn't put them back.
    if (!before || before.deletedAt) return "deleted" as const;
    // So details changed after they were sent to the Data Commissioner show up as not yet sent.
    const dpoDetailsChangedOn = nextDpoDetailsChangedOn(before, parsed.data, todayInKenya());
    await tx
      .update(organizations)
      .set({ ...parsed.data, dpoDetailsChangedOn })
      .where(eq(organizations.id, org.id));
    const summary = editSummary("the organisation's settings", changedFields(before, parsed.data, FIELD_LABELS.organization));
    if (summary) await recordActivity(tx, { orgId: org.id, actorId: user.id, area: "organization", subjectId: org.id, summary });
    const change = organizationParticularChange(before, parsed.data);
    if (!change) return undefined;
    const regs = await tx.select({ role: registrations.role, issuedOn: registrations.issuedOn }).from(registrations).where(eq(registrations.orgId, org.id));
    const suggestion = suggestionFor(change, regs);
    return suggestion ? { ...suggestion, changedOn: todayInKenya() } : undefined;
  });
  if (particulars === "deleted") return { message: "This organisation has been deleted.", values };
  revalidatePath("/", "layout");
  return { message: "Saved.", values, particulars };
}
