import type { Instrumentation } from "next";

// Runs once when the server starts. Missing production config fails here,
// before any request, rather than silently on the first email.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  if (!process.env.APP_URL) throw new Error("APP_URL must be set in production. Email and payment links are built from it.");
  const { assertEmailConfigured } = await import("@/lib/email");
  assertEmailConfigured();
}

// One JSON line per server error, so the host's log search can find it by the
// digest shown on the error page. Point a log alert at "server_error".
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  const error = err instanceof Error ? err : new Error(String(err));
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  console.error(
    JSON.stringify({
      level: "error",
      event: "server_error",
      digest,
      message: error.message,
      stack: error.stack,
      method: request.method,
      // Without the query string, which can carry tokens (reset and invite links).
      path: request.path.split("?")[0],
      route: context.routePath,
      routeType: context.routeType,
    }),
  );
};
