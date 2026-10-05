import { eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { buttonClass, Card } from "@/components/ui";
import { db } from "@/db";
import { memberships, organizations, users } from "@/db/schema";
import { ROLE_LABEL } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { findInvitation } from "@/lib/team";
import { InviteSignupForm, JoinForm } from "./invite-forms";

// The token is in the URL, so don't send it on in the Referer header.
export const metadata: Metadata = { title: "Join your team", referrer: "no-referrer" };

function SignOut() {
  return (
    <form action={logout} className="mt-6 border-t border-stone-200 pt-4">
      <button className="text-sm font-medium text-stone-600 hover:text-stone-900">Sign out</button>
    </form>
  );
}

export default async function InvitePage({ searchParams }: PageProps<"/invite">) {
  const { token } = await searchParams;
  const invite = typeof token === "string" ? await findInvitation(db, token) : null;
  if (typeof token !== "string" || !invite) {
    return (
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Invitation expired</h1>
        <p className="mt-2 text-sm text-stone-600">
          This invitation has expired, has been withdrawn or has already been used. Ask whoever invited you to send a new
          one from their Team page.
        </p>
        <Link href="/login" className={`${buttonClass.secondary} mt-6`}>
          Sign in
        </Link>
      </Card>
    );
  }

  const role = ROLE_LABEL[invite.role].toLowerCase();
  const heading = (
    <>
      <h1 className="text-xl font-semibold">Join {invite.orgName}</h1>
      <p className="mt-1 text-sm text-stone-600">
        {invite.invitedBy ?? "Someone"} invited <span className="font-medium text-stone-900">{invite.email}</span> to
        join {invite.orgName} on Kinga as {invite.role === "member" ? "a" : "an"} {role}.
      </p>
    </>
  );

  const user = await getCurrentUser();
  if (user) {
    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      return (
        <Card className="p-6">
          {heading}
          <p className="mt-4 text-sm text-stone-600">
            You&apos;re signed in as <span className="font-medium text-stone-900">{user.email}</span>. Sign out, then
            open the link in the invitation again to join as {invite.email}.
          </p>
          <SignOut />
        </Card>
      );
    }
    const [current] = await db
      .select({ orgId: organizations.id, name: organizations.name })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(eq(memberships.userId, user.id))
      .limit(1);
    if (current) {
      return (
        <Card className="p-6">
          {heading}
          <p className="mt-4 text-sm text-stone-600">
            {current.orgId === invite.orgId
              ? `You're already on ${invite.orgName}'s team.`
              : `Your account already belongs to ${current.name}, and each Kinga account belongs to one organisation. Ask ${invite.invitedBy ?? "the person who invited you"} to invite a different email address.`}
          </p>
          <Link href="/dashboard" className={`${buttonClass.primary} mt-6`}>
            Go to your dashboard
          </Link>
        </Card>
      );
    }
    return (
      <Card className="p-6">
        {heading}
        <JoinForm token={token} orgName={invite.orgName} />
        <SignOut />
      </Card>
    );
  }

  const [account] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, invite.email.toLowerCase()))
    .limit(1);
  if (account) {
    const next = `/invite?token=${encodeURIComponent(token)}`;
    const login = `/login?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`;
    return (
      <Card className="p-6">
        {heading}
        <p className="mt-4 text-sm text-stone-600">You already have a Kinga account. Sign in to accept.</p>
        <Link href={login} className={`${buttonClass.primary} mt-6`}>
          Sign in to accept
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      {heading}
      <InviteSignupForm token={token} email={invite.email} />
    </Card>
  );
}
