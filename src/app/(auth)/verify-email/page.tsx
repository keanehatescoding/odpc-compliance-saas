import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { Card, FormMessage } from "@/components/ui";
import { VERIFY_LINK_INVALID, VERIFY_LINK_SENT } from "@/lib/auth-messages";
import { getCurrentUser } from "@/lib/session";
import { ChangeEmailForm, ResendForm } from "./verify-email-forms";

export const metadata: Metadata = { title: "Confirm your email" };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.emailVerifiedAt) redirect("/dashboard");
  const { sent, invalid } = await searchParams;

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Confirm your email</h1>
      <div className="mt-4 space-y-4">
        {invalid && <FormMessage message={VERIFY_LINK_INVALID} />}
        {sent && <FormMessage message={VERIFY_LINK_SENT} tone="success" />}
        <p className="text-sm text-stone-600">
          We sent a link to <span className="font-medium text-stone-900">{user.email}</span>. Open it to start using
          Kinga. It expires in 24 hours.
        </p>
        <p className="text-sm text-stone-600">
          Renewal reminders and breach deadline alerts go to this address, so it needs to reach you.
        </p>
        <ResendForm />
      </div>
      <ChangeEmailForm email={user.email} />
      <form action={logout} className="mt-6 border-t border-stone-200 pt-4">
        <button className="text-sm font-medium text-stone-600 hover:text-stone-900">Sign out</button>
      </form>
    </Card>
  );
}
