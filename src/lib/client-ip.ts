type Env = Record<string, string | undefined>;

/**
 * Picks the client IP from request headers, trusting only what the deployment
 * says its proxy sets. Guessing from whichever header is present lets clients
 * spoof their address, since most proxies pass unknown headers through.
 *
 * - TRUST_IP_HEADER=x-forwarded-for (default): take the entry TRUSTED_PROXY_HOPS
 *   from the right (default 1). Each trusted proxy appends one entry, so
 *   anything further left was supplied by the client.
 * - TRUST_IP_HEADER=x-real-ip: only when the proxy overwrites X-Real-IP
 *   (e.g. nginx `proxy_set_header X-Real-IP $remote_addr`).
 */
export function clientIpFromHeaders(h: Pick<Headers, "get">, env: Env): string | null {
  const source = (env.TRUST_IP_HEADER ?? "x-forwarded-for").trim().toLowerCase();
  if (source === "x-real-ip") return h.get("x-real-ip")?.trim() || null;
  if (source !== "x-forwarded-for") {
    throw new Error(`TRUST_IP_HEADER must be "x-forwarded-for" or "x-real-ip", got "${env.TRUST_IP_HEADER}"`);
  }

  const hops = Number(env.TRUSTED_PROXY_HOPS ?? 1);
  if (!Number.isInteger(hops) || hops < 1) {
    throw new Error(`TRUSTED_PROXY_HOPS must be a positive integer, got "${env.TRUSTED_PROXY_HOPS}"`);
  }
  const entries = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return entries.length >= hops ? entries[entries.length - hops] : null;
}
