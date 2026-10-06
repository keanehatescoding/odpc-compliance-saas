import Link from "next/link";
import { redirect } from "next/navigation";
import { LegalLinks } from "@/components/legal-links";
import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";

const features = [
  {
    title: "Never miss a renewal",
    body: "Track your ODPC data controller and processor certificates. Email reminders go out at 90, 60, 30, 14, 7 and 1 days before expiry, then follow up if the certificate lapses.",
  },
  {
    title: "Build your RoPA in an afternoon",
    body: "Start from ready-made entries for schools, clinics, SACCOs, fintechs, retail and hospitality, then edit them to match what you actually do. Export to CSV or print to PDF.",
  },
  {
    title: "Know when you need a DPIA",
    body: "Each processing activity is screened for high-risk signals such as CCTV, sensitive data, children's data and transfers outside Kenya, so you know where an impact assessment is due.",
  },
];

export default async function Home({ searchParams }: PageProps<"/">) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { account } = await searchParams;
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <header className="flex items-center justify-between py-6">
        <Logo />
        <nav className="flex items-center gap-4">
          <Link href="/login" className={buttonClass.link}>
            Sign in
          </Link>
          <Link href="/signup" className={buttonClass.primary}>
            Get started
          </Link>
        </nav>
      </header>

      <main className="py-16 sm:py-24">
        {account === "deleted" && (
          <p role="status" className="mb-10 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Your account has been deleted.
          </p>
        )}
        <p className="text-sm font-medium text-brand-700">Kenya Data Protection Act, 2019</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Stay registered with the ODPC and keep your processing records up to date.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-stone-600">
          For schools, clinics, SACCOs and SMEs that have to comply but don&apos;t have a compliance team. Fines under the
          Act run up to KSh 5 million or 1% of annual turnover.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/signup" className={buttonClass.primary}>
            Create a free account
          </Link>
          <Link href="/login" className={buttonClass.secondary}>
            Sign in
          </Link>
        </div>

        <div className="mt-20 grid gap-6 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title}>
              <h2 className="font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-stone-600">{f.body}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="flex flex-col gap-2 border-t border-stone-200 py-6 text-xs text-stone-500 sm:flex-row sm:justify-between">
        <span>Kinga helps you organise compliance work. It is not legal advice.</span>
        <LegalLinks />
      </footer>
    </div>
  );
}
