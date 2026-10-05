import type { Metadata } from "next";
import { LoginForm } from "./login-form";

// Where the email confirmation link sends people who aren't signed in on that device.
const NOTICES = {
  verified: { message: "Your email is confirmed. Sign in to continue.", tone: "success" },
  invalid: {
    message: "That confirmation link has expired or has already been used. Sign in to send yourself a new one.",
    tone: "error",
  },
} as const;

// `next` and `email` come from the invitation page's "sign in to accept" link.
export const metadata: Metadata = { title: "Sign in", referrer: "no-referrer" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { verified, verify, next, email } = await searchParams;
  const notice = verified ? NOTICES.verified : verify === "invalid" ? NOTICES.invalid : undefined;
  return (
    <LoginForm
      notice={notice}
      next={typeof next === "string" ? next : undefined}
      email={typeof email === "string" ? email : undefined}
    />
  );
}
