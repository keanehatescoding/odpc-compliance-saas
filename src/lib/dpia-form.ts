import { z } from "zod";
import { isIsoDate } from "./dates";
import {
  approvalBlockers,
  defaultReviewDate,
  LIKELIHOOD_KEYS,
  RISK_FIELDS,
  riskErrorKey,
  SEVERITY_KEYS,
  type Likelihood,
  type RiskInput,
  type Severity,
} from "./dpia";

// Parses the DPIA form. Kept apart from ./dpia so client components can use
// the DPIA constants without pulling zod into the bundle.

const text = (max: number) => z.string().trim().max(max).default("");

const optionalDate = z
  .string()
  .trim()
  .default("")
  .transform((v) => v || null)
  .refine((v) => v === null || isIsoDate(v), { error: "Enter a valid date." });

const likelihood = z.enum(LIKELIHOOD_KEYS as [Likelihood, ...Likelihood[]], { error: "Choose a likelihood." });
const severity = z.enum(SEVERITY_KEYS as [Severity, ...Severity[]], { error: "Choose a severity." });

const riskRow = z.object({
  description: text(2000),
  likelihood,
  severity,
  mitigation: text(5000),
  residualLikelihood: likelihood,
  residualSeverity: severity,
});

/** Blank rows are the spare ones the form offers for adding risks. */
const filledRows = (rows: RiskInput[]) => rows.filter((r) => r.description);

export const dpiaFormSchema = z
  .object({
    title: z.string().trim().min(3, { error: "Give the DPIA a title." }).max(200),
    description: text(10000),
    purposes: text(5000),
    necessity: text(10000),
    consultation: text(5000),
    conclusion: text(5000),
    assessor: text(500),
    approvedBy: text(500),
    approvedOn: optionalDate,
    reviewOn: optionalDate,
    odpcConsultedOn: optionalDate,
    rows: z.array(riskRow).max(50, { error: "A DPIA can list up to 50 risks." }),
  })
  // One refinement for every cross-field rule: zod skips later refinements
  // and transforms once one fails, and all errors should show on the first submit.
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    v.rows.forEach((r, i) => {
      if (!r.description && r.mitigation) issue(riskErrorKey(i), "Describe the risk these measures address.");
    });
    if (v.approvedOn) {
      for (const message of approvalBlockers({ ...v, risks: filledRows(v.rows) })) issue("approvedOn", message);
      if (v.reviewOn && v.reviewOn <= v.approvedOn) issue("reviewOn", "The review date must be after the approval date.");
    }
  })
  .transform(({ rows, ...v }) => ({
    ...v,
    reviewOn: v.reviewOn ?? (v.approvedOn ? defaultReviewDate(v.approvedOn) : null),
    risks: filledRows(rows),
  }));

export type DpiaFormData = z.output<typeof dpiaFormSchema>;

export function parseDpiaForm(formData: FormData) {
  const get = (k: string) => formData.get(k) ?? undefined;
  const columns = Object.fromEntries(
    Object.entries(RISK_FIELDS).map(([k, name]) => [k, formData.getAll(name).map(String)]),
  ) as Record<keyof RiskInput, string[]>;
  const rows = columns.description.map((_, i) =>
    Object.fromEntries(Object.keys(RISK_FIELDS).map((k) => [k, columns[k as keyof RiskInput][i]])),
  );
  return dpiaFormSchema.safeParse({
    title: get("title"),
    description: get("description"),
    purposes: get("purposes"),
    necessity: get("necessity"),
    consultation: get("consultation"),
    conclusion: get("conclusion"),
    assessor: get("assessor"),
    approvedBy: get("approvedBy"),
    approvedOn: get("approvedOn"),
    reviewOn: get("reviewOn"),
    odpcConsultedOn: get("odpcConsultedOn"),
    rows,
  });
}
