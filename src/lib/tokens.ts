import { createHash, randomBytes } from "node:crypto";

/** A 256-bit random token, safe to put in a cookie or URL. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Tokens are stored as SHA-256 hashes so a database leak doesn't hand out live sessions or reset links. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
