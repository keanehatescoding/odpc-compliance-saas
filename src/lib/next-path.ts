/**
 * Where to go after signing in: the `next` value if it's a plain path on this
 * site, else the dashboard. Anything else could bounce people to another site
 * (e.g. "//evil.example", or "/\t/evil.example", which browsers read as "//").
 */
export function safeNextPath(next: unknown): string {
  return typeof next === "string" && /^\/(?!\/)[\w\-./?=&%]*$/.test(next) ? next : "/dashboard";
}
