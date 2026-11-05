import Link from "next/link";
import { logChangeHref, NOTIFY_DAYS, type SuggestedChange } from "@/lib/particulars";
import { buttonClass } from "./ui";

/**
 * Shown after an edit that may change what the ODPC has on its register: the
 * team is asked to log the change, so the 14 days to notify are tracked.
 */
export function ParticularsPrompt({ change }: { change: SuggestedChange }) {
  return (
    <div role="status" className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-stone-800">
      <p className="font-medium text-stone-900">This may change your registered particulars</p>
      <p className="mt-1">
        {change.description}. If the ODPC&apos;s register describes this, you have {NOTIFY_DAYS} days to tell the Data Commissioner
        in writing (regulation 15 of the Registration Regulations, 2021).
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link href={logChangeHref(change)} className={buttonClass.primary}>
          Log the change
        </Link>
        <span className="text-stone-600">or ignore this if your registration doesn&apos;t cover it.</span>
      </div>
    </div>
  );
}
