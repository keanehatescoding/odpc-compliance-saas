"use client";

import { createContext, useActionState, useContext, useState, type ReactNode } from "react";
import { SubmitButton } from "@/components/submit-button";
import type { OrderMoveState } from "@/app/actions/staff";

interface OrderResult {
  orderId: string;
  label: string;
  message: string;
}

const ReportResult = createContext<(result: OrderResult) => void>(() => {});

/**
 * Shows, above the list, what happened to orders this user delivered or
 * cancelled. Doing so drops the order's card, and with it the result shown
 * there, such as owners the delivery email didn't reach or the refund still to
 * make. Other results stay in the card only: an order a colleague closes in the
 * meantime leaves the list too, and a result from before that isn't its outcome.
 */
export function OrderResults({ open, children }: { open: string[]; children: ReactNode }) {
  const [results, setResults] = useState<OrderResult[]>([]);
  const report = (result: OrderResult) =>
    setResults((prev) => [result, ...prev.filter((r) => r.orderId !== result.orderId)]);
  const gone = results.filter((r) => !open.includes(r.orderId));
  return (
    <ReportResult value={report}>
      {gone.length > 0 && (
        <ul role="status" className="mb-6 space-y-2">
          {gone.map((r) => (
            <li key={r.orderId} className="rounded-md bg-stone-100 px-4 py-3 text-sm text-stone-800">
              <span className="font-medium">{r.label}:</span> {r.message}
            </li>
          ))}
        </ul>
      )}
      {children}
    </ReportResult>
  );
}

/** Start, deliver or cancel a paid service order. Cancelling asks first. */
export function OrderActions({
  orderId,
  label,
  action,
  started,
}: {
  orderId: string;
  label: string;
  action: (prev: OrderMoveState, formData: FormData) => Promise<OrderMoveState>;
  started: boolean;
}) {
  const report = useContext(ReportResult);
  // Reported as soon as the action returns, before the refreshed list drops this card.
  const [state, formAction] = useActionState(async (prev: OrderMoveState, formData: FormData) => {
    const next = await action(prev, formData);
    if (next?.closed && next.message) report({ orderId, label, message: next.message });
    return next;
  }, undefined);
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
