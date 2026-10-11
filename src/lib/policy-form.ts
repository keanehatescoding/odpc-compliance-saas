import { z } from "zod";
import { isIsoDate } from "./dates";
import { POLICY_KIND_KEYS, type PolicyKind } from "./policy";

// Parses the policy form. Kept apart from ./policy so client components can
// use the constants without pulling zod into the bundle.

const text = (max: number) => z.string().trim().max(max).default("");

const optionalDate = z
  .string()
  .trim()
  .default("")
  .transform((v) => v || null)
  .refine((v) => v === null || isIsoDate(v), { error: "Enter a valid date." });

export function policySchema(today: string) {
  return z
    .object({
      title: z.string().trim().min(3, { error: "Give the policy a title." }).max(200),
      kind: z.enum(POLICY_KIND_KEYS as [PolicyKind, ...PolicyKind[]], { error: "Choose what kind of document it is." }),
      version: text(50),
      owner: text(200),
      approvedBy: text(200),
      approvedOn: optionalDate,
      reviewOn: optionalDate,
      location: text(1000),
      communicated: text(1000),
      notes: text(5000),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (v.approvedOn && !isIsoDate(v.approvedOn)) return;
      if (v.approvedOn && v.approvedOn > today) issue("approvedOn", "This can't be in the future. Leave it blank until the policy is approved.");
      if (v.approvedOn && v.reviewOn && isIsoDate(v.reviewOn) && v.reviewOn <= v.approvedOn) issue("reviewOn", "This must be after the approval.");
    });
}

export type PolicyFormData = z.output<ReturnType<typeof policySchema>>;

export function parsePolicyForm(formData: FormData, today: string) {
  const fields = ["title", "kind", "version", "owner", "approvedBy", "approvedOn", "reviewOn", "location", "communicated", "notes"] as const;
  const input = Object.fromEntries(fields.map((k) => [k, formData.get(k) ?? undefined]));
  return policySchema(today).safeParse(input);
}
