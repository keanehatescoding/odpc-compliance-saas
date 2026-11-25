import { z } from "zod";
import { CONSENT_METHOD_KEYS, type ConsentMethod } from "./consent";
import { isIsoDate } from "./dates";
import { isUuid } from "./uuid";

// Parses the consent record form. Kept apart from ./consent so client
// components can use the constants without pulling zod into the bundle.

const text = (max: number) => z.string().trim().max(max).default("");

const optionalDate = z
  .string()
  .trim()
  .default("")
  .transform((v) => v || null)
  .refine((v) => v === null || isIsoDate(v), { error: "Enter a valid date." });

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal(""), z.null(), z.undefined()])
  .transform((v) => v === "on" || v === "true");

export function consentSchema(today: string) {
  return z
    .object({
      activityId: z
        .string({ error: "Choose the processing activity that relies on this consent." })
        .trim()
        .refine(isUuid, { error: "Choose the processing activity that relies on this consent." }),
      name: z.string().trim().min(3, { error: "Say what people are asked to agree to." }).max(200),
      wording: text(5000),
      method: z.enum(CONSENT_METHOD_KEYS as [ConsentMethod, ...ConsentMethod[]], { error: "Choose how consent is given." }),
      collection: text(1000),
      evidence: text(1000),
      withdrawal: text(2000),
      parental: checkbox,
      guardianCheck: text(1000),
      conditional: checkbox,
      inUseFrom: optionalDate,
      reviewOn: optionalDate,
      notes: text(5000),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (v.inUseFrom && v.inUseFrom > today) issue("inUseFrom", "This can't be in the future.");
      if (v.reviewOn && v.inUseFrom && v.reviewOn < v.inUseFrom) issue("reviewOn", "This can't be before the wording came into use.");
    });
}

export type ConsentFormData = z.output<ReturnType<typeof consentSchema>>;

export function parseConsentForm(formData: FormData, today: string) {
  const fields = [
    "activityId",
    "name",
    "wording",
    "method",
    "collection",
    "evidence",
    "withdrawal",
    "parental",
    "guardianCheck",
    "conditional",
    "inUseFrom",
    "reviewOn",
    "notes",
  ] as const;
  const input = Object.fromEntries(fields.map((k) => [k, formData.get(k) ?? undefined]));
  return consentSchema(today).safeParse(input);
}
