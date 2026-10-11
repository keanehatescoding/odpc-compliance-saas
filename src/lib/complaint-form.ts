import { z } from "zod";
import { COMPLAINT_KIND_KEYS, defaultDueOn, type ComplaintKind } from "./complaint";
import { isIsoDate } from "./dates";

// Parses the ODPC complaint form. Kept apart from ./complaint so client
// components can use the constants without pulling zod into the bundle.

const text = (max: number) => z.string().trim().max(max).default("");

const optionalDate = z
  .string()
  .trim()
  .default("")
  .transform((v) => v || null)
  .refine((v) => v === null || isIsoDate(v), { error: "Enter a valid date." });

export function complaintSchema(today: string) {
  return z
    .object({
      kind: z.enum(COMPLAINT_KIND_KEYS as [ComplaintKind, ...ComplaintKind[]], { error: "Choose what the ODPC sent." }),
      reference: text(200),
      receivedOn: optionalDate,
      dueOn: optionalDate,
      complainant: text(200),
      summary: z.string().trim().min(3, { error: "Describe what it is about." }).max(5000),
      handledBy: text(500),
      respondedOn: optionalDate,
      response: text(5000),
      closedOn: optionalDate,
      outcome: text(5000),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (!v.receivedOn) issue("receivedOn", "Enter the date you received it. The deadline counts from it.");
      else if (v.receivedOn > today) issue("receivedOn", "This can't be in the future.");
      if (v.dueOn) {
        if (v.receivedOn && v.dueOn < v.receivedOn) issue("dueOn", "This can't be before you received it.");
      } else if (v.receivedOn && isIsoDate(v.receivedOn) && !defaultDueOn(v.kind, v.receivedOn)) {
        issue("dueOn", "Enter the date the notice gives.");
      }
      if (v.respondedOn) {
        if (v.respondedOn > today) issue("respondedOn", "This can't be in the future.");
        else if (v.receivedOn && v.respondedOn < v.receivedOn) issue("respondedOn", "This can't be before you received it.");
      } else if (v.response) {
        issue("respondedOn", "Enter the date you responded.");
      }
      if (v.closedOn) {
        if (v.closedOn > today) issue("closedOn", "This can't be in the future.");
        else if (v.receivedOn && v.closedOn < v.receivedOn) issue("closedOn", "This can't be before you received it.");
        else if (v.respondedOn && v.closedOn < v.respondedOn) issue("closedOn", "This can't be before you responded.");
        if (!v.outcome) issue("outcome", "Record how it ended.");
      } else if (v.outcome) {
        issue("closedOn", "Enter the date it was closed.");
      }
    })
    .transform((v) => {
      // The refinements above leave both dates set: the one the notice gives, or the one the law does.
      const receivedOn = v.receivedOn as string;
      return { ...v, receivedOn, dueOn: v.dueOn ?? (defaultDueOn(v.kind, receivedOn) as string) };
    });
}

export type ComplaintFormData = z.output<ReturnType<typeof complaintSchema>>;

export function parseComplaintForm(formData: FormData, today: string) {
  const fields = [
    "kind",
    "reference",
    "receivedOn",
    "dueOn",
    "complainant",
    "summary",
    "handledBy",
    "respondedOn",
    "response",
    "closedOn",
    "outcome",
  ] as const;
  const input = Object.fromEntries(fields.map((k) => [k, formData.get(k) ?? undefined]));
  return complaintSchema(today).safeParse(input);
}
