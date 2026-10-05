import { createHmac, timingSafeEqual } from "node:crypto";

// The two Paystack calls billing needs: start a hosted checkout, and look up
// how a transaction ended. https://paystack.com/docs/api/transaction/

const API = "https://api.paystack.co";

/** What billing needs to know about a Paystack transaction. */
export interface PaystackTransaction {
  reference: string;
  /** "success", "failed", "abandoned", "ongoing", "pending", ... */
  status: string;
  /** In subunits (cents). */
  amount: number;
  currency: string;
  channel: string | null;
  paidAt: Date | null;
}

export interface Paystack {
  /** Starts a checkout and returns the URL to send the payer to. */
  initialize(p: {
    email: string;
    amount: number;
    currency: string;
    reference: string;
    callbackUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ authorizationUrl: string }>;
  verify(reference: string): Promise<PaystackTransaction>;
}

export function paystackFromEnv(env: NodeJS.ProcessEnv = process.env): Paystack | null {
  return env.PAYSTACK_SECRET_KEY ? createPaystack(env.PAYSTACK_SECRET_KEY) : null;
}

export function createPaystack(secretKey: string, fetchImpl: typeof fetch = fetch): Paystack {
  async function call(path: string, init: RequestInit = {}) {
    const res = await fetchImpl(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: unknown } | null;
    if (!res.ok || !body?.status) {
      throw new Error(`Paystack ${path.split("/").slice(0, 3).join("/")} failed (${res.status}): ${body?.message ?? "no response body"}`);
    }
    return body.data as Record<string, unknown>;
  }

  return {
    async initialize(p) {
      const data = await call("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({
          email: p.email,
          amount: p.amount,
          currency: p.currency,
          reference: p.reference,
          callback_url: p.callbackUrl,
          metadata: p.metadata,
        }),
      });
      if (typeof data.authorization_url !== "string") throw new Error("Paystack didn't return a checkout URL.");
      return { authorizationUrl: data.authorization_url };
    },
    async verify(reference) {
      return parseTransaction(await call(`/transaction/verify/${encodeURIComponent(reference)}`));
    },
  };
}

/** Reads the fields billing uses from a Paystack transaction object (API response or webhook `data`). */
export function parseTransaction(data: Record<string, unknown>): PaystackTransaction {
  const paidAt = typeof data.paid_at === "string" ? new Date(data.paid_at) : null;
  return {
    reference: String(data.reference ?? ""),
    status: String(data.status ?? ""),
    amount: Number(data.amount),
    currency: String(data.currency ?? ""),
    channel: typeof data.channel === "string" ? data.channel : null,
    paidAt: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : null,
  };
}

/** Paystack signs each webhook body with HMAC-SHA512 of the secret key, in `x-paystack-signature`. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secretKey: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
