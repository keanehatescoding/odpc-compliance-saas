import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { Card } from "@/components/ui";
import { db } from "@/db";
import { memberships } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { CreateOrganizationForm } from "./create-organization-form";

export const metadata: Metadata = { title: "No organisation" };

// Where signed-in people land when they don't belong to an organisation,
// usually because they were removed from one.
export default async function NoOrganisationPage({ searchParams }: PageProps<"/no-organisation">) {
  const { deleted } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.emailVerifiedAt) redirect("/verify-email");
  const [membership] = await db.select().from(memberships).where(eq(memberships.userId, user.id)).limit(1);
  if (membership) redirect("/dashboard");

  return (
    <Card className="p-6">
      {deleted === "1" ? (
        <>
          <h1 className="text-xl font-semibold">Organisation deleted</h1>
          <p className="mt-2 text-sm text-stone-600">
            Its records and team are gone, and everyone on it has been emailed. Your account,{" "}
            <span className="font-medium text-stone-900">{user.email}</span>, still exists. Set up a new organisation,
            or delete your account below.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold">You&apos;re not on a team</h1>
          <p className="mt-2 text-sm text-stone-600">
            <span className="font-medium text-stone-900">{user.email}</span> doesn&apos;t belong to an organisation on
            Kinga any more. If that&apos;s a mistake, ask an owner or admin to invite you again, then open the link in
            their email. Or set up a new organisation:
          </p>
        </>
      )}
      <CreateOrganizationForm />
      <div className="mt-6 border-t border-stone-200 pt-4">
        <DeleteAccountForm />
      </div>
      <form action={logout} className="mt-4 border-t border-stone-200 pt-4">
        <button className="text-sm font-medium text-stone-600 hover:text-stone-900">Sign out</button>
      </form>
    </Card>
  );
}
