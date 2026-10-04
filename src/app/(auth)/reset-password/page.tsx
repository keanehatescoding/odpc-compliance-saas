import type { Metadata } from "next";
import Link from "next/link";
import { Card, buttonClass } from "@/components/ui";
import { db } from "@/db";
import { RESET_LINK_INVALID } from "@/lib/auth-messages";
import { isResetTokenValid } from "@/lib/password-reset";
import { ResetPasswordForm } from "./reset-password-form";

// The token is in the URL, so don't send it on in the Referer header.
export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  if (typeof token !== "string" || !(await isResetTokenValid(db, token))) {
    return (
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Link expired</h1>
        <p className="mt-2 text-sm text-stone-600">{RESET_LINK_INVALID}</p>
        <Link href="/forgot-password" className={`${buttonClass.primary} mt-6`}>
          Send a new link
        </Link>
      </Card>
    );
  }
  return <ResetPasswordForm token={token} />;
}
