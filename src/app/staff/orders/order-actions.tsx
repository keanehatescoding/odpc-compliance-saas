"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import type { FormState } from "@/lib/forms";

/** Start, deliver or cancel a paid service order. Cancelling asks first. */
export function OrderActions({
  action,
  started,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  started: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction} className="flex flex-wrap justify-end gap-2">
        {!started && (
          <SubmitButton variant="secondary" name="status" value="in_progress" pendingText="Saving…">
            Start
          </SubmitButton>
        )}
        <SubmitButton name="status" value="delivered" pendingText="Saving…">
          Mark delivered
        </SubmitButton>
      </form>
      <details className="group relative">
        <summary className="cursor-pointer list-none text-sm font-medium text-red-700 hover:underline">Cancel order</summary>
        <form action={formAction} className="absolute right-0 z-10 mt-2 w-64 rounded-md border border-stone-200 bg-white p-3 shadow-lg">
          <p className="mb-3 text-sm text-stone-700">
            Cancelling doesn&apos;t refund them. Refund the payment in the Paystack dashboard afterwards.
          </p>
          <SubmitButton variant="danger" name="status" value="cancelled" pendingText="Cancelling…">
            Cancel order
          </SubmitButton>
        </form>
      </details>
      {state?.message && (
        <p role="status" className="max-w-64 text-right text-xs text-stone-700">
          {state.message}
        </p>
      )}
    </div>
  );
}
