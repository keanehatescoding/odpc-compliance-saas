import Link from "next/link";
import { cx } from "./ui";

/** Links to the Terms, Privacy Notice and DPA, for footers. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={cx("flex flex-wrap gap-x-4 gap-y-1", className)}>
      <Link href="/terms" className="hover:text-stone-900 hover:underline">
        Terms
      </Link>
      <Link href="/privacy" className="hover:text-stone-900 hover:underline">
        Privacy
      </Link>
      <Link href="/dpa" className="hover:text-stone-900 hover:underline">
        Data processing
      </Link>
    </nav>
  );
}
