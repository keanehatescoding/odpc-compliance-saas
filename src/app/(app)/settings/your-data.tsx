"use client";

import Link from "next/link";
import { useActionState } from "react";
import { deleteOrganizationAction } from "@/app/actions/account";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass, Card, FormMessage, TextField } from "@/components/ui";
import type { MemberRole } from "@/db/schema";
import { TAX_RECORD_YEARS } from "@/lib/legal";

export function YourData({ orgName, role }: { orgName: string; role: MemberRole }) {
  return (
    <Card className="max-w-2xl">
      <h2 className="text-base font-semibold">Your data</h2>
      <p className="mt-1 text-sm text-stone-600">
        How Kinga handles it is set out in the{" "}
        <Link href="/privacy" className="font-medium text-brand-700 hover:underline">
          Privacy Notice
        </Link>{" "}
        and the{" "}
        <Link href="/dpa" className="font-medium text-brand-700 hover:underline">
          Data Processing Agreement
        </Link>
        .
      </p>

      {role !== "member" && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold">Export</h3>
          <p className="mt-1 text-sm text-stone-600">
            Download everything {orgName} keeps in Kinga as one JSON file: registrations, records of processing, impact
            assessments, breaches, data subject requests, the team and payments.
          </p>
          <a href="/settings/export.json" download className={`${buttonClass.secondary} mt-3`}>
            Download all data
          </a>
        </section>
      )}

      {role === "owner" && <DeleteOrganization orgName={orgName} />}

      <section className="mt-6 border-t border-stone-200 pt-6">
        <h3 className="text-sm font-semibold">Your account</h3>
        <p className="mt-1 mb-3 text-sm text-stone-600">
          {role === "owner"
            ? "If you're the only owner, make someone else an owner or delete the organisation first."
            : "Deleting your account takes you off the team."}
        </p>
        <DeleteAccountForm />
      </section>
    </Card>
  );
}

function DeleteOrganization({ orgName }: { orgName: string }) {
  const [state, action] = useActionState(deleteOrganizationAction, undefined);
  return (
    <section className="mt-6 border-t border-stone-200 pt-6">
      <h3 className="text-sm font-semibold">Delete the organisation</h3>
      <p className="mt-1 text-sm text-stone-600">
        Deletes {orgName}&apos;s registrations, records of processing, impact assessments, breach log, data subject
        requests, invitations and saved card, and removes everyone from the team. Their accounts stay, so they can set
        up a new organisation or delete them. We keep receipts and eTIMS invoices for {TAX_RECORD_YEARS} years, as tax
        law requires. Download your data first: this can&apos;t be undone.
      </p>
      <details className="mt-3" open={Boolean(state)}>
        <summary className="cursor-pointer list-none text-sm font-medium text-red-700 hover:underline">
          Delete {orgName}
        </summary>
        <form action={action} className="mt-4 max-w-sm space-y-4">
          <FormMessage message={state?.message} />
          <TextField
            name="confirmName"
            label={`Type ${orgName} to confirm`}
            autoComplete="off"
            required
            errors={state?.errors}
            values={state?.values}
          />
          <TextField name="password" label="Your password" type="password" autoComplete="current-password" required errors={state?.errors} />
          <SubmitButton variant="danger" pendingText="Deleting…">
            Delete the organisation
          </SubmitButton>
        </form>
      </details>
    </section>
  );
}
