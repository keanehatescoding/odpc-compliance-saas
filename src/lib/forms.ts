import type { z } from "zod";

export type FormValues = Record<string, string | string[]>;

export type FormState =
  | {
      errors?: Record<string, string[] | undefined>;
      message?: string;
      /** Echo of what was submitted, so the form can repopulate after React resets it. */
      values?: FormValues;
    }
  | undefined;

export function formValues(formData: FormData): FormValues {
  const out: FormValues = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const all = formData.getAll(key).filter((v): v is string => typeof v === "string");
    out[key] = all.length > 1 ? all : (all[0] ?? "");
  }
  return out;
}

export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_form");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
