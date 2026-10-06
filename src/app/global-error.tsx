"use client";

// Replaces the root layout when it fails, so it can't rely on globals.css.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en-KE">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: "28rem", margin: "4rem auto", padding: "0 1rem", textAlign: "center" }}>
        <title>Something went wrong · Kinga</title>
        <h1 style={{ fontSize: "1.5rem" }}>Something went wrong</h1>
        <p style={{ color: "#57534e", fontSize: "0.875rem" }}>
          Try again, and if it keeps happening, contact support
          {error.digest ? ` with this reference: ${error.digest}` : ""}.
        </p>
        <button type="button" onClick={() => retry()} style={{ marginTop: "1.5rem", padding: "0.5rem 1rem" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
