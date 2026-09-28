"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "rounded-md px-3 py-2 text-sm font-medium",
        active ? "bg-brand-50 text-brand-900" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
      )}
    >
      {children}
    </Link>
  );
}
