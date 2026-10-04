import "server-only";
import { headers } from "next/headers";
import { clientIpFromHeaders } from "@/lib/client-ip";

/**
 * The client's IP address for rate limiting, or null if unknown. Which header
 * is trusted is set by TRUST_IP_HEADER and TRUSTED_PROXY_HOPS (see
 * clientIpFromHeaders). This needs a reverse proxy in front of the app:
 * `next start` alone only fills X-Forwarded-For when the client didn't send
 * one, so a directly exposed server can be fed any address.
 */
export async function clientIp(): Promise<string | null> {
  return clientIpFromHeaders(await headers(), process.env);
}
