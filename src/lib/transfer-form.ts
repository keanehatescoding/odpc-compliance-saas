import { z } from "zod";
import { isIsoDate } from "./dates";
import { TRANSFER_BASIS_KEYS, type TransferBasis } from "./transfer";
import { isUuid } from "./uuid";

// Parses the transfer form. Kept apart from ./transfer so client components
// can use the constants without pulling zod into the bundle.

const text = (max: number) => z.string().trim().max(max).default("");

const optionalDate = z
  .string()
  .trim()
  .default("")
  .transform((v) => v || null)
  .refine((v) => v === null || isIsoDate(v), { error: "Enter a valid date." });

export function transferSchema(today: string) {
  return z
    .object({
      activityId: z
        .string({ error: "Choose the processing activity this transfer is part of." })
        .trim()
        .refine(isUuid, { error: "Choose the processing activity this transfer is part of." }),
      recipient: z.string().trim().min(2, { error: "Say who receives the data." }).max(200),
      countries: text(500),
      dataSent: text(2000),
      basis: z.enum(TRANSFER_BASIS_KEYS as [TransferBasis, ...TransferBasis[]], { error: "Choose what the transfer relies on, or that it isn't decided yet." }),
      basisDetail: text(5000),
      subjectConsent: text(2000),
      evidence: text(500),
      startedOn: optionalDate,
      reviewOn: optionalDate,
      notes: text(5000),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (v.startedOn && v.startedOn > today) issue("startedOn", "This can't be in the future.");
      if (v.reviewOn && v.startedOn && v.reviewOn < v.startedOn) issue("reviewOn", "This can't be before the transfer began.");
    });
}

export type TransferFormData = z.output<ReturnType<typeof transferSchema>>;

export function parseTransferForm(formData: FormData, today: string) {
  const fields = [
    "activityId",
    "recipient",
    "countries",
    "dataSent",
    "basis",
    "basisDetail",
    "subjectConsent",
    "evidence",
    "startedOn",
    "reviewOn",
    "notes",
  ] as const;
  const input = Object.fromEntries(fields.map((k) => [k, formData.get(k) ?? undefined]));
  return transferSchema(today).safeParse(input);
}
