import type { Metadata } from "next";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import { NavLink } from "@/components/nav-link";
import { db } from "@/db";
import { requireStaff } from "@/lib/session";
import { openServiceOrderCount } from "@/lib/staff";

export const metadata: Metadata = { title: { template: "%s · Kinga staff", default: "Kinga staff" }, robots: { index: false } };

export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  const user = await requireStaff();
  const openOrders = await openServiceOrderCount(db);
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-stone-200 bg-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:flex-col md:border-r md:border-b-0">
        <div className="px-4 py-4 md:px-5 md:py-6">
          <Logo href="/staff" />
          <p className="mt-1 text-xs font-medium tracking-wide text-brand-700 uppercase">Staff</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:pb-0">
          <NavLink href="/staff/organisations">Organisations</NavLink>
          <NavLink href="/staff/orders">
            Service orders
            {openOrders > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">{openOrders}</span>
            )}
          </NavLink>
        </nav>
        <div className="hidden border-t border-stone-200 px-5 py-4 md:block">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-stone-500">{user.email}</p>
          <Link href="/dashboard" className="mt-2 block text-xs font-medium text-stone-600 hover:text-stone-900">
            Your organisation
          </Link>
          <form action={logout} className="mt-1">
            <button className="text-xs font-medium text-stone-600 hover:text-stone-900">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
