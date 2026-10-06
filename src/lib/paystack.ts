import { createHmac, timingSafeEqual } from "node:crypto";

// The Paystack calls billing needs: start a hosted checkout, look up how a
// transaction ended, charge or forget a saved card for automatic renewal, and
// list what has been refunded.
// https://paystack.com/docs/api/transaction/

const API = "https://api.paystack.co";
/** Refunds asked for per page when listing a transaction's refunds. */
const REFUND_PAGE = 100;

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
  /** The card or account used, when Paystack says. */
  authorization?: PaystackAuthorization | null;
  /** The Paystack customer's email, which a saved card must be charged with. */
  customerEmail?: string | null;
}

/** A payment method Paystack can charge again, if `reusable` (cards only, in practice). */
export interface PaystackAuthorization {
  code: string;
  reusable: boolean;
  channel: string | null;
  brand: string | null;
  last4: string | null;
  /** 1–12. */
  expMonth: number | null;
  expYear: number | null;
}

/** Money given back on a transaction, from the Paystack dashboard or API. */
export interface PaystackRefund {
  id: string;
  /** "pending", "processing", "needs-attention", "failed" or "processed". */
  status: string;
  /** In subunits (cents). */
  amount: number;
  currency: string;
  refundedAt: Date | null;
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
  /**
   * Charges a saved card without the payer present. `paused` means the bank
   * wants the payer to approve it (e.g. by OTP), so it can't complete now.
   */
  chargeAuthorization(p: {
    authorizationCode: string;
    email: string;
    amount: number;
    currency: string;
    reference: string;
    metadata: Record<string, string>;
  }): Promise<PaystackTransaction & { paused: boolean; gatewayResponse: string | null }>;
  /** Stops a saved card being charged again. */
  deactivateAuthorization(authorizationCode: string): Promise<void>;
  /** Every refund of a transaction, in any status. */
  refunds(reference: string): Promise<PaystackRefund[]>;
}

/** Paystack answered, but refused the request. `reason` is Paystack's own message. */
export class PaystackError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason: string | null,
  ) {
    super(message);
    this.name = "PaystackError";
  }
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
      throw new PaystackError(
        `Paystack ${path.split("/").slice(0, 3).join("/")} failed (${res.status}): ${body?.message ?? "no response body"}`,
        res.status,
        body?.message ?? null,
      );
    }
    return body.data as Record<string, unknown>;
  }
  const date = (v: unknown) => {
    const d = typeof v === "string" ? new Date(v) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  };

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
    async chargeAuthorization(p) {
      const data = await call("/transaction/charge_authorization", {
        method: "POST",
        body: JSON.stringify({
          authorization_code: p.authorizationCode,
          email: p.email,
          amount: p.amount,
          currency: p.currency,
          reference: p.reference,
          metadata: p.metadata,
        }),
      });
      return {
        ...parseTransaction(data),
        paused: data.paused === true,
        gatewayResponse: typeof data.gateway_response === "string" ? data.gateway_response : null,
      };
    },
    async deactivateAuthorization(authorizationCode) {
      await call("/customer/deactivate_authorization", {
        method: "POST",
        body: JSON.stringify({ authorization_code: authorizationCode }),
      });
    },
    async refunds(reference) {
      // Refunds are listed by Paystack's transaction ID, not our reference.
      const txn = await call(`/transaction/verify/${encodeURIComponent(reference)}`);
      if (txn.id === undefined || txn.id === null) throw new Error(`Paystack didn't return an ID for transaction ${reference}.`);
      const list: Record<string, unknown>[] = [];
      // A page shorter than asked for is the last.
      for (let page = 1; ; page++) {
        const data = (await call(`/refund?transaction=${encodeURIComponent(String(txn.id))}&perPage=${REFUND_PAGE}&page=${page}`)) as unknown;
        const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
        list.push(...rows);
        if (rows.length < REFUND_PAGE) break;
      }
      return list
        .filter((r) => {
          // Guards against the filter being ignored: keep only this transaction's refunds.
          const t = r.transaction && typeof r.transaction === "object" ? (r.transaction as Record<string, unknown>).id : r.transaction;
          return t === undefined || String(t) === String(txn.id);
        })
        .map((r) => ({
          id: String(r.id ?? ""),
          status: String(r.status ?? ""),
          amount: Number(r.amount),
          currency: String(r.currency ?? ""),
          refundedAt: date(r.refunded_at),
        }))
        .filter((r) => r.id && Number.isInteger(r.amount));
    },
  };
}

/** Reads the fields billing uses from a Paystack transaction object (API response or webhook `data`). */
export function parseTransaction(data: Record<string, unknown>): PaystackTransaction {
  const paidAt = typeof data.paid_at === "string" ? new Date(data.paid_at) : null;
  const customer = data.customer && typeof data.customer === "object" ? (data.customer as Record<string, unknown>) : null;
  return {
    reference: String(data.reference ?? ""),
    status: String(data.status ?? ""),
    amount: Number(data.amount),
    currency: String(data.currency ?? ""),
    channel: typeof data.channel === "string" ? data.channel : null,
    paidAt: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : null,
    authorization: parseAuthorization(data.authorization),
    customerEmail: typeof customer?.email === "string" ? customer.email : null,
  };
}

function parseAuthorization(a: unknown): PaystackAuthorization | null {
  if (!a || typeof a !== "object") return null;
  const r = a as Record<string, unknown>;
  if (typeof r.authorization_code !== "string" || !r.authorization_code) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const int = (v: unknown) => {
    const n = Number(v);
    return v !== null && v !== "" && Number.isInteger(n) ? n : null;
  };
  return {
    code: r.authorization_code,
    reusable: r.reusable === true,
    channel: str(r.channel),
    brand: str(r.brand) ?? str(r.card_type),
    last4: str(r.last4),
    expMonth: int(r.exp_month),
    expYear: int(r.exp_year),
  };
}

/**
 * Paystack signs each webhook body with HMAC-SHA512 of the secret key, in
 * `x-paystack-signature` as hex. Anything that isn't 128 hex digits is
 * rejected before comparing, since timingSafeEqual throws on unequal lengths.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secretKey: string): boolean {
  if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest();
  return timingSafeEqual(Buffer.from(signature, "hex"), expected);
}
