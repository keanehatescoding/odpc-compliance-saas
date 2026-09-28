import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import { NavLink } from "@/components/nav-link";
import { requireOrgContext } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, org } = await requireOrgContext();
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
          <NavLink href="/breaches">Data breaches</NavLink>
          <NavLink href="/settings">Settings</NavLink>
        </nav>
        <div className="hidden border-t border-stone-200 px-5 py-4 md:block">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-stone-500">{user.email}</p>
          <form action={logout} className="mt-2">
            <button className="text-xs font-medium text-stone-600 hover:text-stone-900">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
