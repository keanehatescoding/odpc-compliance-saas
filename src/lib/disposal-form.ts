import { z } from "zod";
import { isIsoDate } from "./dates";
import { DISPOSAL_METHOD_KEYS, DISPOSAL_REASON_KEYS, type DisposalMethod, type DisposalReason } from "./disposal";
import { isUuid } from "./uuid";

// Parses the disposal form. Kept apart from ./disposal so client components
// can use the constants without pulling zod into the bundle.

const text = (max: number) => z.string().trim().max(max).default("");

const optionalDate = z
  .string()
  .trim()
  .default("")
  .transform((v) => v || null)
  .refine((v) => v === null || isIsoDate(v), { error: "Enter a valid date." });

const optionalCount = z
  .string()
  .trim()
  .default("")
  .refine((v) => v === "" || (/^\d{1,9}$/.test(v) && Number(v) > 0), { error: "Enter a whole number, or leave it blank." })
  .transform((v) => (v === "" ? null : Number(v)));

const optionalId = z
  .string()
  .trim()
  .default("")
  .transform((v) => v || null)
  .refine((v) => v === null || isUuid(v), { error: "Choose an activity from the list." });

export function disposalSchema(today: string) {
  return z
    .object({
      description: z.string().trim().min(3, { error: "Say what was disposed of." }).max(500),
      activityId: optionalId,
      disposedOn: z
        .string({ error: "Enter the date it was done." })
        .trim()
        .refine(isIsoDate, { error: "Enter the date it was done." }),
      method: z.enum(DISPOSAL_METHOD_KEYS as [DisposalMethod, ...DisposalMethod[]], { error: "Choose how it was disposed of." }),
      reason: z.enum(DISPOSAL_REASON_KEYS as [DisposalReason, ...DisposalReason[]], { error: "Choose why it was disposed of." }),
      recordCount: optionalCount,
      authorisedBy: text(200),
      carriedOutBy: text(200),
      evidence: text(1000),
      nextOn: optionalDate,
      notes: text(5000),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (!isIsoDate(v.disposedOn)) return;
      if (v.disposedOn > today) issue("disposedOn", "This can't be in the future. Record the disposal once it has been done.");
      if (v.nextOn && v.nextOn <= v.disposedOn) issue("nextOn", "This must be after the disposal.");
    });
}

export type DisposalFormData = z.output<ReturnType<typeof disposalSchema>>;

export function parseDisposalForm(formData: FormData, today: string) {
  const fields = [
    "description",
    "activityId",
    "disposedOn",
    "method",
    "reason",
    "recordCount",
    "authorisedBy",
    "carriedOutBy",
    "evidence",
    "nextOn",
    "notes",
  ] as const;
  const input = Object.fromEntries(fields.map((k) => [k, formData.get(k) ?? undefined]));
  return disposalSchema(today).safeParse(input);
}
