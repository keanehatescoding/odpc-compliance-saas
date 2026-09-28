const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route params reach Postgres as uuid; reject junk before it becomes a 500. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
