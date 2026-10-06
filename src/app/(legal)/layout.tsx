import { LegalLinks } from "@/components/legal-links";
import { Logo } from "@/components/logo";

export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6">
      <header className="no-print py-6">
        <Logo />
      </header>
      <main className="legal pb-16">{children}</main>
      <footer className="no-print flex flex-col gap-2 border-t border-stone-200 py-6 text-xs text-stone-500 sm:flex-row sm:justify-between">
        <span>Kinga helps you organise compliance work. It is not legal advice.</span>
        <LegalLinks />
      </footer>
    </div>
  );
}
