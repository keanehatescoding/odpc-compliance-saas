import { z } from "zod";
import { isIsoDate, todayInKenya } from "./dates";
import { defaultExpiry } from "./registration";

// Parses the registration (ODPC certificate) form. Kept apart from ./registration
// so client components can use it without pulling zod into the bundle.

const text = (max: number) => z.string().trim().max(max).default("");

const optionalDate = z
  .string()
  .trim()
  .default("")
  .transform((v) => v || null)
  .refine((v) => v === null || isIsoDate(v), { error: "Enter a valid date." });

const pastDate = z
  .string()
  .trim()
  .default("")
  .transform((v) => v || null)
  .refine((v) => v === null || isIsoDate(v), { error: "Enter a valid date." });

export function registrationSchema(today: string) {
  return z
    .object({
      role: z.enum(["controller", "processor"], { error: "Choose controller or processor." }),
      certificateNumber: z
        .string()
        .trim()
        .max(100)
        .transform((v) => v || null),
      appliedOn: pastDate,
      issuedOn: pastDate,
      expiresOn: optionalDate,
      notes: text(2000),
    })
    .transform((v) => ({ ...v, expiresOn: v.expiresOn ?? (v.issuedOn ? defaultExpiry(v.issuedOn) : null) }))
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (v.appliedOn && isIsoDate(v.appliedOn) && v.appliedOn > today) issue("appliedOn", "This can't be in the future.");
      if (v.issuedOn && isIsoDate(v.issuedOn) && v.issuedOn > today) issue("issuedOn", "This can't be in the future.");
      if (v.issuedOn && v.expiresOn && v.expiresOn <= v.issuedOn) {
        ctx.addIssue({ code: "custom", path: ["expiresOn"], message: "Expiry must be after the issue date." });
      }
      if (v.expiresOn && !v.issuedOn) {
        ctx.addIssue({ code: "custom", path: ["issuedOn"], message: "Enter the issue date shown on the certificate." });
      }
    });
}

// Alias for callers that prefer the form-style name.
export const registrationFormSchema = registrationSchema;

export type RegistrationFormData = z.output<ReturnType<typeof registrationSchema>>;

export function parseRegistrationForm(formData: FormData, today: string = todayInKenya()) {
  return registrationSchema(today).safeParse({
    role: formData.get("role"),
    certificateNumber: formData.get("certificateNumber") ?? "",
    appliedOn: formData.get("appliedOn") ?? "",
    issuedOn: formData.get("issuedOn") ?? "",
    expiresOn: formData.get("expiresOn") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

// Alias for callers that prefer the plural form-style name.
export const parseRegistrationsForm = parseRegistrationForm;
