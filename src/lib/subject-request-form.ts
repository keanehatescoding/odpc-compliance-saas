import { z } from "zod";
import { isIsoDate } from "./dates";
import { REQUEST_KIND_KEYS, REQUEST_OUTCOME_KEYS, type RequestKind, type RequestOutcome } from "./subject-request";

// Parses the data subject request form. Kept apart from ./subject-request so
// client components can use the constants without pulling zod into the bundle.

const text = (max: number) => z.string().trim().max(max).default("");

const optionalDate = z
  .string()
  .trim()
  .default("")
  .transform((v) => v || null)
  .refine((v) => v === null || isIsoDate(v), { error: "Enter a valid date." });

export function subjectRequestSchema(today: string) {
  return z
    .object({
      kind: z.enum(REQUEST_KIND_KEYS as [RequestKind, ...RequestKind[]], { error: "Choose what they asked for." }),
      receivedOn: optionalDate,
      requesterName: z.string().trim().min(1, { error: "Enter who made the request." }).max(200),
      requesterContact: text(500),
      representative: text(500),
      channel: text(200),
      details: z.string().trim().min(3, { error: "Describe what they asked for." }).max(5000),
      identityCheck: text(1000),
      outcome: z
        .union([z.enum(REQUEST_OUTCOME_KEYS as [RequestOutcome, ...RequestOutcome[]]), z.literal("")], {
          error: "Choose an outcome.",
        })
        .default("")
        .transform((v) => v || null),
      respondedOn: optionalDate,
      response: text(5000),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (!v.receivedOn) issue("receivedOn", "Enter the date you received the request. The deadline counts from it.");
      else if (v.receivedOn > today) issue("receivedOn", "This can't be in the future.");
      if (v.respondedOn) {
        if (v.respondedOn > today) issue("respondedOn", "This can't be in the future.");
        else if (v.receivedOn && v.respondedOn < v.receivedOn) issue("respondedOn", "This can't be before you received the request.");
        if (!v.outcome) issue("outcome", "Choose the outcome of your response.");
      } else if (v.outcome) {
        issue("respondedOn", "Enter the date you responded.");
      }
      if (v.outcome === "declined" && !v.response) {
        issue("response", "Record your reasons for declining. You must give them to the person in writing.");
      }
    });
}

export type SubjectRequestFormData = z.output<ReturnType<typeof subjectRequestSchema>>;

export function parseSubjectRequestForm(formData: FormData, today: string) {
  const fields = [
    "kind",
    "receivedOn",
    "requesterName",
    "requesterContact",
    "representative",
    "channel",
    "details",
    "identityCheck",
    "outcome",
    "respondedOn",
    "response",
  ] as const;
  const input = Object.fromEntries(fields.map((k) => [k, formData.get(k) ?? undefined]));
  return subjectRequestSchema(today).safeParse(input);
}
