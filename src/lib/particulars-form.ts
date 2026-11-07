import { z } from "zod";
import { isIsoDate } from "./dates";

// Parses the change-of-particulars form. Kept apart from ./particulars so
// client components can use the constants without pulling zod into the bundle.

const text = (max: number) => z.string().trim().max(max).default("");

const optionalDate = z
  .string()
  .trim()
  .default("")
  .transform((v) => v || null)
  .refine((v) => v === null || isIsoDate(v), { error: "Enter a valid date." });

export function particularChangeSchema(today: string) {
  return z
    .object({
      // "both" is the form's word for a change to every registration.
      role: z
        .enum(["controller", "processor", "both"], { error: "Choose which registration it changes." })
        .transform((v) => (v === "both" ? null : v)),
      changedOn: optionalDate,
      description: z.string().trim().min(3, { error: "Say what changed." }).max(2000),
      notifiedOn: optionalDate,
      notifiedHow: text(1000),
      notes: text(5000),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (!v.changedOn) issue("changedOn", "Enter the date it changed. The 14 days count from it.");
      else if (v.changedOn > today) issue("changedOn", "This can't be in the future. Log it once it has changed.");
       if (v.notifiedOn) {
         if (v.notifiedOn > today) issue("notifiedOn", "This can't be in the future.");
         else if (v.changedOn && v.notifiedOn < v.changedOn) issue("notifiedOn", "This can't be before the change happened.");
       } else if (v.notifiedHow) {
         issue("notifiedOn", "Enter the date you told the ODPC.");
       }
    })
    .transform((v) => ({ ...v, changedOn: v.changedOn as string }));
}

export type ParticularChangeFormData = z.output<ReturnType<typeof particularChangeSchema>>;

export function parseParticularChangeForm(formData: FormData, today: string) {
  const fields = ["role", "changedOn", "description", "notifiedOn", "notifiedHow", "notes"] as const;
  const input = Object.fromEntries(fields.map((k) => [k, formData.get(k) ?? undefined]));
  return particularChangeSchema(today).safeParse(input);
}
