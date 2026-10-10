import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { BREACH_STATUS_LABEL, type BreachStatus } from "@/lib/breach";
import { DPIA_STATUS_LABEL, RISK_LEVEL_LABEL, type DpiaStatus, type RiskLevel } from "@/lib/dpia";
import type { FormValues } from "@/lib/forms";
import { PROCESSOR_STATUS_LABEL, type ProcessorStatus } from "@/lib/processor";
import { STATUS_LABEL, type RegistrationStatus } from "@/lib/registration";
import { REQUEST_STATUS_LABEL, type RequestStatus } from "@/lib/subject-request";
import { TRAINING_STATUS_LABEL, type TrainingStatus } from "@/lib/training";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export const buttonClass = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 disabled:opacity-60",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60",
  link: "text-sm font-medium text-brand-700 hover:underline",
};

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-stone-600">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-lg border border-stone-200 bg-white p-5 shadow-xs", className)} {...props} />;
}

const STATUS_STYLE: Record<RegistrationStatus, string> = {
  active: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  applied: "bg-sky-50 text-sky-800 ring-sky-200",
  renewal_due: "bg-amber-50 text-amber-800 ring-amber-200",
  expiring_soon: "bg-orange-50 text-orange-800 ring-orange-300",
  not_started: "bg-stone-100 text-stone-700 ring-stone-300",
  expired: "bg-red-50 text-red-800 ring-red-300",
};

export function StatusBadge({ status }: { status: RegistrationStatus }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const BREACH_STATUS_STYLE: Record<BreachStatus, string> = {
  open: "bg-orange-50 text-orange-800 ring-orange-300",
  overdue: "bg-red-50 text-red-800 ring-red-300",
  notified: "bg-sky-50 text-sky-800 ring-sky-200",
  not_required: "bg-stone-100 text-stone-700 ring-stone-300",
  closed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
};

export function BreachStatusBadge({ status }: { status: BreachStatus }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", BREACH_STATUS_STYLE[status])}>
      {BREACH_STATUS_LABEL[status]}
    </span>
  );
}

const REQUEST_STATUS_STYLE: Record<RequestStatus, string> = {
  open: "bg-sky-50 text-sky-800 ring-sky-200",
  due_soon: "bg-orange-50 text-orange-800 ring-orange-300",
  overdue: "bg-red-50 text-red-800 ring-red-300",
  completed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  declined: "bg-stone-100 text-stone-700 ring-stone-300",
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", REQUEST_STATUS_STYLE[status])}>
      {REQUEST_STATUS_LABEL[status]}
    </span>
  );
}

const PROCESSOR_STATUS_STYLE: Record<ProcessorStatus, string> = {
  no_contract: "bg-red-50 text-red-800 ring-red-300",
  review_due: "bg-amber-50 text-amber-800 ring-amber-200",
  in_place: "bg-emerald-50 text-emerald-800 ring-emerald-200",
};

export function ProcessorStatusBadge({ status }: { status: ProcessorStatus }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", PROCESSOR_STATUS_STYLE[status])}>
      {PROCESSOR_STATUS_LABEL[status]}
    </span>
  );
}

const TRAINING_STATUS_STYLE: Record<TrainingStatus, string> = {
  current: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  refresher_due: "bg-amber-50 text-amber-800 ring-amber-200",
  refreshed: "bg-stone-100 text-stone-700 ring-stone-300",
};

export function TrainingStatusBadge({ status }: { status: TrainingStatus }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", TRAINING_STATUS_STYLE[status])}>
      {TRAINING_STATUS_LABEL[status]}
    </span>
  );
}

const DPIA_STATUS_STYLE: Record<DpiaStatus, string> = {
  draft: "bg-stone-100 text-stone-700 ring-stone-300",
  approved: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  review_due: "bg-amber-50 text-amber-800 ring-amber-200",
};

export function DpiaStatusBadge({ status }: { status: DpiaStatus }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", DPIA_STATUS_STYLE[status])}>
      {DPIA_STATUS_LABEL[status]}
    </span>
  );
}

const RISK_LEVEL_STYLE: Record<RiskLevel, string> = {
  low: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  medium: "bg-amber-50 text-amber-800 ring-amber-200",
  high: "bg-red-50 text-red-800 ring-red-300",
};

export function RiskLevelBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", RISK_LEVEL_STYLE[level])}>
      {RISK_LEVEL_LABEL[level]}
    </span>
  );
}

export function Pill({ children, tone = "stone" }: { children: ReactNode; tone?: "stone" | "amber" | "red" }) {
  const tones = {
    stone: "bg-stone-100 text-stone-700",
    amber: "bg-amber-100 text-amber-900",
    red: "bg-red-100 text-red-800",
  };
  return <span className={cx("inline-flex rounded px-1.5 py-0.5 text-xs", tones[tone])}>{children}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-stone-600">{children}</div>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Form fields. Values come from `values` (echoed back after a failed submit)
// falling back to `initial` (the saved record).
// ---------------------------------------------------------------------------

type FieldCommon = {
  name: string;
  label: string;
  hint?: ReactNode;
  errors?: Record<string, string[] | undefined>;
  values?: FormValues;
  initial?: string;
};

const inputClass =
  "block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm shadow-xs placeholder:text-stone-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none aria-invalid:border-red-500";

function valueOf(name: string, values?: FormValues, initial?: string): string {
  const v = values?.[name];
  if (v === undefined) return initial ?? "";
  return Array.isArray(v) ? v.join(", ") : v;
}

function FieldShell({ name, label, hint, errors, children }: FieldCommon & { children: ReactNode }) {
  const err = errors?.[name];
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium text-stone-800">
        {label}
      </label>
      {children}
      {hint && !err && <p className="text-xs text-stone-500">{hint}</p>}
      {err?.map((e) => (
        <p key={e} id={`${name}-error`} className="text-xs text-red-700">
          {e}
        </p>
      ))}
    </div>
  );
}

export function TextField({
  name,
  label,
  hint,
  errors,
  values,
  initial,
  ...input
}: FieldCommon & Omit<ComponentProps<"input">, "name" | "defaultValue">) {
  return (
    <FieldShell {...{ name, label, hint, errors }}>
      <input
        id={name}
        name={name}
        defaultValue={valueOf(name, values, initial)}
        aria-invalid={Boolean(errors?.[name]) || undefined}
        aria-describedby={errors?.[name] ? `${name}-error` : undefined}
        className={inputClass}
        {...input}
      />
    </FieldShell>
  );
}

export function TextArea({
  name,
  label,
  hint,
  errors,
  values,
  initial,
  ...input
}: FieldCommon & Omit<ComponentProps<"textarea">, "name" | "defaultValue">) {
  return (
    <FieldShell {...{ name, label, hint, errors }}>
      <textarea
        id={name}
        name={name}
        rows={3}
        defaultValue={valueOf(name, values, initial)}
        aria-invalid={Boolean(errors?.[name]) || undefined}
        aria-describedby={errors?.[name] ? `${name}-error` : undefined}
        className={inputClass}
        {...input}
      />
    </FieldShell>
  );
}

export function SelectField({
  name,
  label,
  hint,
  errors,
  values,
  initial,
  options,
  placeholder,
}: FieldCommon & { options: Record<string, string>; placeholder?: string }) {
  return (
    <FieldShell {...{ name, label, hint, errors }}>
      <select
        id={name}
        name={name}
        defaultValue={valueOf(name, values, initial)}
        aria-invalid={Boolean(errors?.[name]) || undefined}
        aria-describedby={errors?.[name] ? `${name}-error` : undefined}
        className={inputClass}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({
  name,
  label,
  hint,
  values,
  initial,
}: Omit<FieldCommon, "initial" | "errors"> & { initial?: boolean }) {
  const checked = values ? values[name] === "on" : Boolean(initial);
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5 size-4 accent-brand-600" />
      <span>
        <span className="font-medium text-stone-800">{label}</span>
        {hint && <span className="block text-xs text-stone-500">{hint}</span>}
      </span>
    </label>
  );
}

export function FormMessage({ message, tone = "error" }: { message?: string; tone?: "error" | "success" }) {
  if (!message) return null;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-md px-3 py-2 text-sm",
        tone === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800",
      )}
    >
      {message}
    </p>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="no-print mb-4 inline-block text-sm text-stone-600 hover:text-stone-900">
      ← {children}
    </Link>
  );
}
