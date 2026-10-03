import "server-only";
import { headers } from "next/headers";

/**
 * The client's IP address for rate limiting, or null if unknown. Trusts
 * X-Real-IP, then the rightmost X-Forwarded-For entry (the one our own proxy
 * appended). This needs a reverse proxy in front of the app (Vercel, nginx,
 * Caddy): `next start` alone only fills X-Forwarded-For when the client
 * didn't send one, so a directly exposed server can be fed any address.
 */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const realIp = h.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = h.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return forwarded || null;
}
