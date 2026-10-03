/** Postgres unique_violation, possibly wrapped by drizzle in `cause`. */
export function isUniqueViolation(err: unknown): boolean {
  for (
    let e = err;
    e && typeof e === "object";
    e = (e as { cause?: unknown }).cause
  ) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}
