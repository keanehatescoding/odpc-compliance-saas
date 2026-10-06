import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-12">
      <Logo />
      <div className="mt-8 w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-stone-600">
          This page doesn&apos;t exist, or the record was deleted or belongs to another organisation.
        </p>
        <Link href="/dashboard" className={`${buttonClass.primary} mt-6`}>
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
