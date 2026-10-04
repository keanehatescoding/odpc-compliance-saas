import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { verifyEmail } from "@/lib/email-verification";
import { getCurrentUser } from "@/lib/session";

// The link in the verification email. A GET, so mail scanners that open links
// may use it up first; that still proves the address receives mail, and the
// person clicking lands somewhere sensible either way. It never signs anyone
// in, so a leaked link can't open the account.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const verifiedId = token ? await verifyEmail(db, token) : null;
  const user = await getCurrentUser();

  let dest: string;
  if (verifiedId) dest = user?.id === verifiedId ? "/dashboard" : "/login?verified=1";
  else if (!user) dest = "/login?verify=invalid";
  else dest = user.emailVerifiedAt ? "/dashboard" : "/verify-email?invalid=1";

  const res = NextResponse.redirect(new URL(dest, request.url));
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
