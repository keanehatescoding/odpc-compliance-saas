import { z } from "zod";
import { isIsoDate } from "./dates";

// Parses the processor form. Kept apart from ./processor so client components
// can use the constants without pulling zod into the bundle.

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

export function processorSchema(today: string) {
  return z
    .object({
      name: z.string().trim().min(2, { error: "Enter the processor's name." }).max(200),
      service: z.string().trim().min(3, { error: "Describe what they do for you." }).max(2000),
      contact: text(500),
      location: text(200),
      outsideKenya: checkbox,
      guarantees: text(2000),
      contractSignedOn: optionalDate,
      contractRef: text(500),
      contractReviewOn: optionalDate,
      notes: text(5000),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (v.contractSignedOn && v.contractSignedOn > today) issue("contractSignedOn", "This can't be in the future.");
      if (v.contractReviewOn) {
        if (!v.contractSignedOn) issue("contractReviewOn", "Enter the date the contract was signed first.");
        else if (v.contractReviewOn < v.contractSignedOn) issue("contractReviewOn", "This can't be before the contract was signed.");
      }
    });
}

export type ProcessorFormData = z.output<ReturnType<typeof processorSchema>>;

export function parseProcessorForm(formData: FormData, today: string) {
  const fields = [
    "name",
    "service",
    "contact",
    "location",
    "outsideKenya",
    "guarantees",
    "contractSignedOn",
    "contractRef",
    "contractReviewOn",
    "notes",
  ] as const;
  const input = Object.fromEntries(fields.map((k) => [k, formData.get(k) ?? undefined]));
  return processorSchema(today).safeParse(input);
}
