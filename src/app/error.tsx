"use client";

import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-12">
      <Logo />
      <div className="mt-8 w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm text-stone-600">
          Your changes may not have been saved. Try again, and if it keeps happening, contact support
          {error.digest ? (
            <>
              {" "}
              with this reference: <code className="font-mono">{error.digest}</code>
            </>
          ) : null}
          .
        </p>
        <button type="button" onClick={() => retry()} className={`${buttonClass.primary} mt-6`}>
          Try again
        </button>
      </div>
    </div>
  );
}
