import Link from "next/link";

/** The required "I agree" box on signup forms. Posts terms=on. */
export function TermsConsent({ errors, dpa = false }: { errors?: Record<string, string[] | undefined>; dpa?: boolean }) {
  const err = errors?.terms;
  const link = (href: string, text: string) => (
    <Link href={href} target="_blank" className="font-medium text-brand-700 hover:underline">
      {text}
    </Link>
  );
  return (
    <div className="space-y-1.5">
      <label className="flex items-start gap-3 text-sm text-stone-700">
        <input
          type="checkbox"
          name="terms"
          required
          aria-invalid={Boolean(err) || undefined}
          aria-describedby={err ? "terms-error" : undefined}
          className="mt-0.5 size-4 accent-brand-600"
        />
        <span>
          I agree to the {link("/terms", "Terms of Service")}
          {dpa && <> and the {link("/dpa", "Data Processing Agreement")} for my organisation</>}, and I&apos;ve read the{" "}
          {link("/privacy", "Privacy Notice")}.
        </span>
      </label>
      {err?.map((e) => (
        <p key={e} id="terms-error" className="text-xs text-red-700">
          {e}
        </p>
      ))}
    </div>
  );
}
