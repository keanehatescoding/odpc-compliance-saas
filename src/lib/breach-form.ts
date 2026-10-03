import { z } from "zod";
import {
  BREACH_KIND_KEYS,
  BREACH_RISK_KEYS,
  notificationRequired,
  notifiedLate,
  NOTIFY_WHOM,
  NOTIFY_WITHIN_HOURS,
  roleOf,
  subjectNoticeRequired,
  type BreachKind,
  type BreachRisk,
} from "./breach";
import { parseKenyaDateTime } from "./dates";
import { SENSITIVE_CATEGORIES } from "./dpa";

// Parses the breach form. Kept apart from ./breach so client components can
// use the breach constants without pulling zod into the bundle.

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal(""), z.null(), z.undefined()])
  .transform((v) => v === "on" || v === "true");

const text = (max: number) => z.string().trim().max(max).default("");

/** Allowance for a slightly fast client clock when rejecting future times. */
const CLOCK_SKEW_MS = 5 * 60_000;

function dateTime(now: Date, opts: { required?: string } = {}) {
  return z
    .string()
    .trim()
    .default("")
    .transform((v, ctx) => {
      if (!v) {
        if (opts.required) ctx.addIssue({ code: "custom", message: opts.required });
        return null;
      }
      const d = parseKenyaDateTime(v);
      if (!d) {
        ctx.addIssue({ code: "custom", message: "Enter a valid date and time." });
        return null;
      }
      if (d.getTime() > now.getTime() + CLOCK_SKEW_MS) {
        ctx.addIssue({ code: "custom", message: "This can't be in the future." });
        return null;
      }
      return d;
    });
}

export function breachFormSchema(now: Date) {
  return z
    .object({
      title: z.string().trim().min(3, { error: "Give the breach a short title." }).max(200),
      kind: z.enum(BREACH_KIND_KEYS as [BreachKind, ...BreachKind[]], { error: "Choose what happened." }),
      role: z.enum(["controller", "processor"], { error: "Choose controller or processor." }),
      description: z.string().trim().min(10, { error: "Describe what happened." }).max(5000),
      occurredAt: dateTime(now),
      discoveredAt: dateTime(now, { required: "Enter when you became aware of the breach." }),
      dataSubjects: text(1000),
      approxSubjects: z
        .string()
        .trim()
        .default("")
        .transform((v) => (v === "" ? null : Number(v)))
        .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 1e9), {
          error: "Enter a whole number, or leave blank if unknown.",
        }),
      dataCategories: text(2000),
      sensitiveCategories: z
        .array(z.enum(SENSITIVE_CATEGORIES, { error: "Choose from the listed categories." }))
        .max(SENSITIVE_CATEGORIES.length)
        .default([]),
      dataUnintelligible: checkbox,
      risk: z.enum(BREACH_RISK_KEYS as [BreachRisk, ...BreachRisk[]], { error: "Choose a risk level." }),
      riskNotes: text(5000),
      measures: text(5000),
      subjectAdvice: text(5000),
      unauthorisedParty: text(1000),
      contactPerson: text(500),
      notifiedAt: dateTime(now),
      notificationRef: text(200),
      delayReason: text(5000),
      subjectsNotifiedAt: dateTime(now),
      subjectsNotifiedHow: text(1000),
      closedAt: dateTime(now),
      lessons: text(5000),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      const d = v.discoveredAt;
      if (d) {
        if (v.occurredAt && v.occurredAt > d) issue("occurredAt", "The breach can't have happened after you found out about it.");
        for (const k of ["notifiedAt", "subjectsNotifiedAt", "closedAt"] as const) {
          const t = v[k];
          if (t && t < d) issue(k, "This can't be before you became aware of the breach.");
        }
        if (v.notifiedAt && notifiedLate({ role: v.role, discoveredAt: d, notifiedAt: v.notifiedAt }) && !v.delayReason) {
          issue("delayReason", `Notification was after the ${NOTIFY_WITHIN_HOURS[roleOf(v)]}-hour deadline. Explain the delay.`);
        }
      }
      if (v.risk === "unlikely" && v.role === "controller" && !v.riskNotes) {
        issue("riskNotes", "Record why you concluded harm is unlikely. The ODPC may ask to see your reasoning.");
      }
      if (v.closedAt) {
        if (notificationRequired(v) && !v.notifiedAt) {
          issue("closedAt", `Record when you notified ${NOTIFY_WHOM[roleOf(v)]} before closing this breach.`);
        }
        if (subjectNoticeRequired(v) && !v.subjectsNotifiedAt) {
          issue("closedAt", "Record when you told the people affected before closing this breach.");
        }
        if (v.risk === "unassessed") issue("closedAt", "Assess the risk before closing this breach.");
      }
    });
}

export type BreachFormData = z.output<ReturnType<typeof breachFormSchema>>;

export function parseBreachForm(formData: FormData, now: Date) {
  const get = (k: string) => formData.get(k) ?? undefined;
  const fields = [
    "title",
    "kind",
    "role",
    "description",
    "occurredAt",
    "discoveredAt",
    "dataSubjects",
    "approxSubjects",
    "dataCategories",
    "dataUnintelligible",
    "risk",
    "riskNotes",
    "measures",
    "subjectAdvice",
    "unauthorisedParty",
    "contactPerson",
    "notifiedAt",
    "notificationRef",
    "delayReason",
    "subjectsNotifiedAt",
    "subjectsNotifiedHow",
    "closedAt",
    "lessons",
  ] as const;
  const input: Record<string, unknown> = Object.fromEntries(fields.map((k) => [k, get(k)]));
  input.sensitiveCategories = formData.getAll("sensitiveCategories").map(String);
  return breachFormSchema(now).safeParse(input);
}
