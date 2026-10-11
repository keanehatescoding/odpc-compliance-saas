import { z } from "zod";
import { isIsoDate } from "./dates";
import { LIA_OUTCOME_KEYS, type LiaOutcome } from "./lia";
import { isUuid } from "./uuid";

// Parses the legitimate interest assessment form. Kept apart from ./lia so
// client components can use the constants without pulling zod into the bundle.

const text = (max: number) => z.string().trim().max(max).default("");

const optionalDate = z
  .string()
  .trim()
  .default("")
  .transform((v) => v || null)
  .refine((v) => v === null || isIsoDate(v), { error: "Enter a valid date." });

export function liaSchema(today: string) {
  return z
    .object({
      activityId: z
        .string({ error: "Choose the processing activity this assessment is for." })
        .trim()
        .refine(isUuid, { error: "Choose the processing activity this assessment is for." }),
      name: z.string().trim().min(3, { error: "Give the assessment a name." }).max(200),
      interest: text(5000),
      necessity: text(5000),
      impact: text(5000),
      safeguards: text(5000),
      objection: text(2000),
      outcome: z.enum(LIA_OUTCOME_KEYS as [LiaOutcome, ...LiaOutcome[]], { error: "Choose the decision, or that it isn't decided yet." }),
      decidedBy: text(200),
      decidedOn: optionalDate,
      reviewOn: optionalDate,
      notes: text(5000),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (v.decidedOn && v.decidedOn > today) issue("decidedOn", "This can't be in the future.");
      if (v.decidedOn && v.outcome === "pending") issue("decidedOn", "Choose the decision, or leave this blank until there is one.");
      if (v.reviewOn && v.decidedOn && v.reviewOn < v.decidedOn) issue("reviewOn", "This can't be before the decision.");
    });
}

export type LiaFormData = z.output<ReturnType<typeof liaSchema>>;

export function parseLiaForm(formData: FormData, today: string) {
  const fields = [
    "activityId",
    "name",
    "interest",
    "necessity",
    "impact",
    "safeguards",
    "objection",
    "outcome",
    "decidedBy",
    "decidedOn",
    "reviewOn",
    "notes",
  ] as const;
  const input = Object.fromEntries(fields.map((k) => [k, formData.get(k) ?? undefined]));
  return liaSchema(today).safeParse(input);
}
