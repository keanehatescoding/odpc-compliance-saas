"use client";

import { useActionState } from "react";
import { inviteMember } from "@/app/actions/team";
import { SubmitButton } from "@/components/submit-button";
import { Card, cx, FormMessage, SelectField, TextField } from "@/components/ui";
import type { MemberRole } from "@/db/schema";
import type { FormState } from "@/lib/forms";
import { ROLE_LABEL } from "@/lib/roles";

const roleOptions = (roles: MemberRole[]) => Object.fromEntries(roles.map((r) => [r, ROLE_LABEL[r]]));

export function InviteForm({ roles }: { roles: MemberRole[] }) {
  const [state, action] = useActionState(inviteMember, undefined);
  const f = { errors: state?.errors, values: state?.values };
  const sent = Boolean(state?.message && !state.values);
  return (
    <Card className="max-w-2xl">
      <h2 className="font-semibold">Invite someone</h2>
      <p className="mt-1 text-sm text-stone-600">
        They&apos;ll get an email with a link to join. It works for 7 days, and only for the address you enter.
      </p>
      <form action={action} className="mt-5 space-y-5">
        <FormMessage message={state?.message} tone={sent ? "success" : "error"} />
        <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
          <TextField name="email" label="Email" type="email" autoComplete="off" required {...f} />
          <SelectField name="role" label="Role" options={roleOptions(roles)} initial="member" {...f} />
        </div>
        <SubmitButton pendingText="Sending…">Send invitation</SubmitButton>
      </form>
    </Card>
  );
}

export function RoleForm({
  action,
  roles,
  current,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  roles: MemberRole[];
  current: MemberRole;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <select
          name="role"
          aria-label="Role"
          defaultValue={current}
          disabled={pending}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <noscript>
          <button className="text-sm font-medium text-brand-700">Save</button>
        </noscript>
      </div>
      {state?.message && (
        <p role="status" className={cx("max-w-56 text-right text-xs", state.message === "Saved." ? "text-emerald-700" : "text-red-700")}>
          {state.message}
        </p>
      )}
    </form>
  );
}

/** A link-style button for a row action. With `confirm`, the first click asks before acting. */
export function ConfirmActionButton({
  action,
  label,
  confirm,
  confirmLabel,
}: {
  action: (prev: FormState) => Promise<FormState>;
  label: string;
  confirm?: string;
  confirmLabel?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const message = state?.message && <p className="mt-1 max-w-56 text-xs text-stone-700">{state.message}</p>;
  if (!confirm) {
    return (
      <form action={formAction}>
        <SubmitButton variant="link" pendingText="Sending…">
          {label}
        </SubmitButton>
        {message}
      </form>
    );
  }
  return (
    <div>
      <details className="group relative">
        <summary className="cursor-pointer list-none text-sm font-medium text-red-700 hover:underline">{label}</summary>
        <form action={formAction} className="absolute right-0 z-10 mt-2 w-64 rounded-md border border-stone-200 bg-white p-3 shadow-lg">
          <p className="mb-3 text-sm text-stone-700">{confirm}</p>
          <SubmitButton variant="danger" pendingText="Working…">
            {confirmLabel ?? label}
          </SubmitButton>
        </form>
      </details>
      {message}
    </div>
  );
}
