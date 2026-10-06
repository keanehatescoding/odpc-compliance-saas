import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import { NavLink } from "@/components/nav-link";
import { accessFor } from "@/lib/plans";
import { requireOrgContext } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, org } = await requireOrgContext();
  const access = accessFor(org);
  return (
    <div className="min-h-screen md:flex">
      <aside className="no-print border-b border-stone-200 bg-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-4 py-4 md:block md:px-5 md:py-6">
          <Logo href="/dashboard" />
          <form action={logout} className="md:hidden">
            <button className="text-sm font-medium text-stone-600 hover:text-stone-900">Sign out</button>
          </form>
          <p className="mt-1 hidden truncate text-xs text-stone-500 md:block" title={org.name}>
            {org.name}
          </p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:pb-0">
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavLink href="/registrations">ODPC registration</NavLink>
          <NavLink href="/ropa">Records of processing</NavLink>
          <NavLink href="/dpia">Impact assessments</NavLink>
          <NavLink href="/breaches">Data breaches</NavLink>
          <NavLink href="/requests">Data subject requests</NavLink>
          <NavLink href="/services">Expert services</NavLink>
          <NavLink href="/team">Team</NavLink>
          <NavLink href="/settings">Settings</NavLink>
          <NavLink href="/billing">Billing</NavLink>
        </nav>
        <div className="hidden border-t border-stone-200 px-5 py-4 md:block">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-stone-500">{user.email}</p>
          <form action={logout} className="mt-2">
            <button className="text-xs font-medium text-stone-600 hover:text-stone-900">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-8">
        {access.state === "lapsed" ? (
          <p className="no-print mb-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
            Your {org.paidUntil ? "subscription" : "free trial"} has ended, so records are read-only. Breaches, the team and
            settings still work.{" "}
            <Link href="/billing" className="font-medium underline">
              Pay to keep editing
            </Link>
          </p>
        ) : (
          access.daysLeft <= 7 && (
            <p className="no-print mb-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Your {access.state === "trial" ? "free trial" : "subscription"} ends in {access.daysLeft}{" "}
              {access.daysLeft === 1 ? "day" : "days"}.{" "}
              <Link href="/billing" className="font-medium underline">
                Go to billing
              </Link>
            </p>
          )
        )}
        {children}
      </main>
    </div>
  );
}
