import { z } from "zod";
import { isIsoDate } from "./dates";
import { isUuid } from "./uuid";

// Parses the training session form. Kept apart from ./training so client
// components can use the constants without pulling zod into the bundle.

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
  .refine((v) => v === "" || (/^\d{1,6}$/.test(v) && Number(v) > 0), { error: "Enter a whole number, or leave it blank." })
  .transform((v) => (v === "" ? null : Number(v)));

const optionalId = z
  .string()
  .trim()
  .default("")
  .transform((v) => v || null)
  .refine((v) => v === null || isUuid(v), { error: "Choose a session from the list." });

export function trainingSchema(today: string) {
  return z
    .object({
      title: z.string().trim().min(3, { error: "Give the session a title." }).max(200),
      heldOn: z
        .string({ error: "Enter the date it was held." })
        .trim()
        .refine(isIsoDate, { error: "Enter the date it was held." }),
      provider: text(200),
      audience: z.string().trim().min(2, { error: "Say who the session was for." }).max(500),
      attendeeCount: optionalCount,
      topics: z.string().trim().min(3, { error: "Say what the session covered." }).max(5000),
      evidence: text(500),
      refresherOn: optionalDate,
      refreshesId: optionalId,
      notes: text(5000),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (!isIsoDate(v.heldOn)) return;
      if (v.heldOn > today) issue("heldOn", "This can't be in the future. Record the session once it has been held.");
      if (v.refresherOn && v.refresherOn <= v.heldOn) issue("refresherOn", "This must be after the session was held.");
    });
}

export type TrainingFormData = z.output<ReturnType<typeof trainingSchema>>;

export function parseTrainingForm(formData: FormData, today: string) {
  const fields = [
    "title",
    "heldOn",
    "provider",
    "audience",
    "attendeeCount",
    "topics",
    "evidence",
    "refresherOn",
    "refreshesId",
    "notes",
  ] as const;
  const input = Object.fromEntries(fields.map((k) => [k, formData.get(k) ?? undefined]));
  return trainingSchema(today).safeParse(input);
}

export interface SessionDate {
  id: string;
  title: string;
  heldOn: string;
  refreshesId: string | null;
}

/**
 * Checks a session's dates against the organisation's other sessions: a
 * refresher comes after the session it refreshes, which also keeps two
 * sessions from refreshing each other. `id` is null for a new session.
 */
export function refresherErrors(
  session: { id: string | null; heldOn: string; refreshesId: string | null },
  others: SessionDate[],
): Record<string, string[]> | null {
  const errors: Record<string, string[]> = {};
  if (session.refreshesId) {
    const earlier = others.find((o) => o.id === session.refreshesId && o.id !== session.id);
    if (!earlier) errors.refreshesId = ["Choose a session from the list."];
    else if (earlier.heldOn >= session.heldOn) errors.refreshesId = ["A refresher has to be held after the session it refreshes."];
  }
  const refresher = others
    .filter((o) => session.id !== null && o.refreshesId === session.id && o.heldOn <= session.heldOn)
    .sort((a, b) => a.heldOn.localeCompare(b.heldOn))[0];
  if (refresher) errors.heldOn = [`This must be before its refresher, “${refresher.title}”, was held.`];
  return Object.keys(errors).length > 0 ? errors : null;
}
