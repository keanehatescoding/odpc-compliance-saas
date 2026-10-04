import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

// Where the email confirmation link sends people who aren't signed in on that device.
const NOTICES = {
  verified: { message: "Your email is confirmed. Sign in to continue.", tone: "success" },
  invalid: {
    message: "That confirmation link has expired or has already been used. Sign in to send yourself a new one.",
    tone: "error",
  },
} as const;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { verified, verify } = await searchParams;
  const notice = verified ? NOTICES.verified : verify === "invalid" ? NOTICES.invalid : undefined;
  return <LoginForm notice={notice} />;
}
