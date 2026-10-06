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
//
// The message is left out on purpose: Drizzle puts the SQL and its bound
// params into it (emails, names, token hashes), and the stack repeats it in
// its header. Only the name and the frames are logged, plus the code of the
// underlying error (a Postgres SQLSTATE like 23505, or ECONNREFUSED) so a
// failed query still says what kind of failure it was.
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  const error = err instanceof Error ? err : new Error(String(err));
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  console.error(
    JSON.stringify({
      level: "error",
      event: "server_error",
      digest,
      name: error.name,
      causeCode: causeCode(error),
      frames: error.stack?.split("\n").filter((line) => /^\s+at /.test(line)).map((line) => line.trim()),
      method: request.method,
      // Without the query string, which can carry tokens (reset and invite links).
      path: request.path.split("?")[0],
      route: context.routePath,
      routeType: context.routeType,
    }),
  );
};

// Only a short code-shaped string is returned, so a driver that put something
// else in `code` can't leak it into the logs.
function causeCode(error: Error): string | undefined {
  const cause = error.cause;
  if (typeof cause !== "object" || cause === null || !("code" in cause)) return undefined;
  const code = String(cause.code);
  return /^[A-Z0-9_]{1,32}$/.test(code) ? code : undefined;
}
