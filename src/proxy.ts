import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: bounce requests without a session cookie to /login.
// Real authorisation happens in requireOrgContext() on every page and action.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("session")) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/registrations/:path*",
    "/ropa/:path*",
    "/breaches/:path*",
    "/dpia/:path*",
    "/requests/:path*",
    "/team/:path*",
    "/settings/:path*",
    "/billing/:path*",
  ],
};
