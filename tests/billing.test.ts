import { createHmac } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import {
  dueBillingAlert,
  formatReceiptNumber,
  getReceipt,
  paymentOutcome,
  PAYMENTS_UNAVAILABLE,
  PENDING_PAYMENT_KEEP_MS,
  prunePayments,
  recordPayment,
  receiptEmail,
  runBillingAlerts,
  sellerFromEnv,
  sendReceipt,
  startCheckout,
} from "@/lib/billing";
import type { EmailMessage } from "@/lib/email";
import { createPaystack, PaystackError, parseTransaction, verifyWebhookSignature, type Paystack, type PaystackTransaction } from "@/lib/paystack";
import { accessFor, addPeriod, TRIAL_DAYS } from "@/lib/plans";

const { memberships, organizations, payments, users } = schema;

const DAY = 24 * 60 * 60 * 1000;
const t0 = new Date("2026-10-05T09:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);

let db: Db;
let orgId: string;
let ownerId: string;

async function org() {
  const [o] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  return o;
}

const fakePaystack = (fail: boolean | Error = false): Paystack & { calls: unknown[] } => {
  const calls: unknown[] = [];
  return {
    calls,
    async initialize(p) {
      calls.push(p);
      if (fail) throw fail instanceof Error ? fail : new Error("network down");
      return { authorizationUrl: `https://checkout.paystack.com/${p.reference}` };
    },
    async verify() {
      throw new Error("not used");
    },
  };
};

async function checkout(interval: "month" | "year" = "month") {
  const r = await startCheckout(db, fakePaystack(), {
    orgId,
    userId: ownerId,
    email: "owner@sunrise.ke",
    size: "micro_small",
    interval,
    callbackUrl: "http://localhost:3000/billing/callback",
  });
  if ("error" in r) throw new Error(r.error);
  // The fake checkout URL ends with the reference.
  const [p] = await db.select().from(payments).where(eq(payments.reference, r.url.split("/").pop()!));
  return p;
}

const paid = (p: { reference: string; amount: number }, extra: Partial<PaystackTransaction> = {}): PaystackTransaction => ({
  reference: p.reference,
  status: "success",
  amount: p.amount,
  currency: "KES",
  channel: "mobile_money",
  paidAt: t0,
  ...extra,
});

beforeEach(async () => {
  const client = new PGlite();
  const pg = drizzle({ client, schema });
  await migrate(pg, { migrationsFolder: "drizzle" });
  db = pg as unknown as Db;

  const [o] = await db
    .insert(organizations)
    .values({ name: "Sunrise Academy", sector: "education", size: "micro_small", trialEndsAt: later(TRIAL_DAYS * DAY) })
    .returning({ id: organizations.id });
  orgId = o.id;
  const [u] = await db
    .insert(users)
    .values({ email: "owner@sunrise.ke", name: "Owner", passwordHash: "x", emailVerifiedAt: t0 })
    .returning({ id: users.id });
  ownerId = u.id;
  await db.insert(memberships).values({ orgId, userId: ownerId, role: "owner" });
});

describe("access", () => {
  it("gives new organisations a trial by default", async () => {
    const [o] = await db
      .insert(organizations)
      .values({ name: "New", sector: "retail", size: "medium" })
      .returning();
    const days = (o.trialEndsAt.getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(TRIAL_DAYS - 0.01);
    expect(days).toBeLessThanOrEqual(TRIAL_DAYS);
    expect(o.paidUntil).toBeNull();
  });

  it("is a trial, then active once paid, then lapsed", () => {
    const trialEndsAt = later(14 * DAY);
    expect(accessFor({ trialEndsAt, paidUntil: null }, t0)).toEqual({ state: "trial", endsAt: trialEndsAt, daysLeft: 14 });
    expect(accessFor({ trialEndsAt, paidUntil: null }, later(14 * DAY - 1))).toMatchObject({ state: "trial", daysLeft: 1 });
    expect(accessFor({ trialEndsAt, paidUntil: null }, trialEndsAt)).toMatchObject({ state: "lapsed", daysLeft: 0 });

    const paidUntil = later(44 * DAY);
    expect(accessFor({ trialEndsAt, paidUntil }, t0)).toMatchObject({ state: "active", endsAt: paidUntil, daysLeft: 44 });
    expect(accessFor({ trialEndsAt, paidUntil }, paidUntil)).toMatchObject({ state: "lapsed", endsAt: paidUntil });
  });

  it("adds whole months and years, clamping to the end of short months", () => {
    expect(addPeriod(new Date("2026-01-31T10:00:00Z"), "month").toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addPeriod(new Date("2028-01-31T10:00:00Z"), "month").toISOString()).toBe("2028-02-29T10:00:00.000Z");
    expect(addPeriod(new Date("2026-12-15T10:00:00Z"), "month").toISOString()).toBe("2027-01-15T10:00:00.000Z");
    expect(addPeriod(new Date("2028-02-29T10:00:00Z"), "year").toISOString()).toBe("2029-02-28T10:00:00.000Z");
  });
});

describe("checkout", () => {
  it("records a pending payment at the plan price and starts a Paystack checkout", async () => {
    const paystack = fakePaystack();
    const r = await startCheckout(db, paystack, {
      orgId,
      userId: ownerId,
      email: "owner@sunrise.ke",
      size: "medium",
      interval: "year",
      callbackUrl: "http://localhost:3000/billing/callback",
    });
    expect(r).toMatchObject({ url: expect.stringMatching(/^https:\/\/checkout\.paystack\.com\/kinga-[0-9a-f]{32}$/) });
    const [p] = await db.select().from(payments);
    expect(p).toMatchObject({ orgId, interval: "year", amount: 5_000_000, currency: "KES", status: "pending", startedBy: ownerId });
    expect(paystack.calls[0]).toMatchObject({ reference: p.reference, amount: 5_000_000, currency: "KES", email: "owner@sunrise.ke" });
  });

  it("marks the payment failed if Paystack can't be reached", async () => {
    const r = await startCheckout(db, fakePaystack(true), {
      orgId,
      userId: ownerId,
      email: "owner@sunrise.ke",
      size: "micro_small",
      interval: "month",
      callbackUrl: "x",
    });
    expect(r).toHaveProperty("error");
    const [p] = await db.select().from(payments);
    expect(p.status).toBe("failed");
  });

  it("says why when Paystack turns a checkout down", async () => {
    const attempt = (err: Error) =>
      startCheckout(db, fakePaystack(err), {
        orgId,
        userId: ownerId,
        email: "owner@sunrise.ke",
        size: "micro_small",
        interval: "month",
        callbackUrl: "x",
      });
    const rejected = await attempt(new PaystackError("failed (400)", 400, '"email" must be a valid email'));
    expect(rejected).toEqual({ error: expect.stringContaining('turned down this payment ("email" must be a valid email)') });
    expect(await attempt(new PaystackError("failed (401)", 401, "Invalid key"))).toEqual({ error: PAYMENTS_UNAVAILABLE });
    expect(await attempt(new PaystackError("failed (502)", 502, null))).toEqual({ error: expect.stringContaining("couldn't reach") });
  });
});

describe("recording payments", () => {
  it("credits a payment made during the trial from the end of the trial", async () => {
    const p = await checkout("month");
    const r = await recordPayment(db, paid(p), later(3 * DAY));
    expect(r).toMatchObject({ result: "credited", orgId });
    const o = await org();
    expect(o.paidUntil).toEqual(addPeriod(o.trialEndsAt, "month"));
    const [row] = await db.select().from(payments).where(eq(payments.id, p.id));
    expect(row).toMatchObject({ status: "succeeded", channel: "mobile_money", paidAt: t0, periodStart: o.trialEndsAt });
  });

  it("credits each payment once, however many times Paystack reports it", async () => {
    const p = await checkout("month");
    const results = await Promise.all([recordPayment(db, paid(p), t0), recordPayment(db, paid(p), t0)]);
    expect(results.map((r) => r.result).sort()).toEqual(["already_credited", "credited"]);
    expect(await recordPayment(db, paid(p), later(DAY))).toMatchObject({ result: "already_credited" });
    expect((await org()).paidUntil).toEqual(addPeriod((await org()).trialEndsAt, "month"));
  });

  it("stacks payments, and starts from the payment after a lapse", async () => {
    const first = await checkout("month");
    await recordPayment(db, paid(first), t0);
    const second = await checkout("year");
    await recordPayment(db, paid(second), t0);
    const o = await org();
    expect(o.paidUntil).toEqual(addPeriod(addPeriod(o.trialEndsAt, "month"), "year"));

    const afterLapse = new Date(o.paidUntil!.getTime() + 10 * DAY);
    const third = await checkout("month");
    await recordPayment(db, paid(third), afterLapse);
    expect((await org()).paidUntil).toEqual(addPeriod(afterLapse, "month"));
  });

  it("doesn't credit unpaid, mismatched or unknown transactions", async () => {
    const p = await checkout("month");
    expect(await recordPayment(db, paid(p, { status: "abandoned" }), t0)).toMatchObject({ result: "not_paid" });
    expect(await recordPayment(db, paid(p, { amount: 100 }), t0)).toMatchObject({ result: "mismatch" });
    expect(await recordPayment(db, paid(p, { currency: "NGN" }), t0)).toMatchObject({ result: "mismatch" });
    expect(await recordPayment(db, paid({ reference: "kinga-nope", amount: p.amount }), t0)).toEqual({ result: "unknown" });
    expect((await org()).paidUntil).toBeNull();
    // The real payment can still be credited afterwards.
    expect(await recordPayment(db, paid(p), t0)).toMatchObject({ result: "credited" });
  });

  it("only tells a returning payer it failed once it can't succeed", () => {
    expect(paymentOutcome("credited", "success")).toBe("paid");
    expect(paymentOutcome("already_credited", "success")).toBe("paid");
    for (const status of ["failed", "reversed"]) expect(paymentOutcome("not_paid", status)).toBe("unpaid");
    for (const status of ["ongoing", "pending", "processing", "queued", "abandoned"]) {
      expect(paymentOutcome("not_paid", status)).toBe("checking");
    }
    expect(paymentOutcome("mismatch", "success")).toBe("problem");
    expect(paymentOutcome("unknown", "success")).toBe("problem");
  });

  it("keeps the amount fixed when checkout started", async () => {
    const p = await checkout("month");
    await db.update(organizations).set({ size: "large" }).where(eq(organizations.id, orgId));
    expect(await recordPayment(db, paid(p), t0)).toMatchObject({ result: "credited" });
  });

  it("prunes unpaid checkouts after 30 days but keeps payments", async () => {
    const unpaid = await checkout("month");
    const done = await checkout("month");
    await recordPayment(db, paid(done), t0);
    await db.update(payments).set({ createdAt: t0 });
    await prunePayments(db, new Date(t0.getTime() + PENDING_PAYMENT_KEEP_MS - 1));
    expect(await db.select().from(payments)).toHaveLength(2);
    await prunePayments(db, new Date(t0.getTime() + PENDING_PAYMENT_KEEP_MS + 1));
    expect((await db.select().from(payments)).map((p) => p.id)).toEqual([done.id]);
    expect(unpaid.id).not.toBe(done.id);
  });
});

describe("receipts", () => {
  const receipt = async (id: string) => (await db.select().from(payments).where(eq(payments.id, id)))[0];

  it("numbers credited payments in order and keeps the name and KRA PIN they were paid under", async () => {
    await db.update(organizations).set({ kraPin: "P051234567X" }).where(eq(organizations.id, orgId));
    const first = await checkout("month");
    const second = await checkout("year");
    const unpaid = await checkout("month");
    await recordPayment(db, paid(second), t0);
    await recordPayment(db, paid(unpaid, { status: "abandoned" }), t0);
    await Promise.all([recordPayment(db, paid(first), t0), recordPayment(db, paid(first), t0)]);
    await db.update(organizations).set({ name: "Sunrise Academy Ltd", kraPin: null }).where(eq(organizations.id, orgId));

    const [a, b, c] = [await receipt(second.id), await receipt(first.id), await receipt(unpaid.id)];
    expect(b.receiptNumber).toBe(a.receiptNumber! + 1);
    expect(a).toMatchObject({ billedName: "Sunrise Academy", billedKraPin: "P051234567X" });
    expect(c).toMatchObject({ receiptNumber: null, billedName: null });
    expect(formatReceiptNumber(42)).toBe("R-000042");
  });

  it("shows a receipt only to its organisation, once paid", async () => {
    const p = await checkout("month");
    expect(await getReceipt(db, orgId, p.id)).toBeNull();
    await recordPayment(db, paid(p), t0);
    expect(await getReceipt(db, orgId, p.id)).toMatchObject({ id: p.id });
    const [other] = await db
      .insert(organizations)
      .values({ name: "Other", sector: "retail", size: "medium" })
      .returning({ id: organizations.id });
    expect(await getReceipt(db, other.id, p.id)).toBeNull();
  });

  it("emails the receipt to whoever paid", async () => {
    const p = await checkout("year");
    await recordPayment(db, paid(p, { channel: "card" }), t0);
    const sent: EmailMessage[] = [];
    await sendReceipt(db, async (m) => void sent.push(m), p.id, "https://app.test");
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["owner@sunrise.ke"]);
    const { receiptNumber } = await receipt(p.id);
    expect(sent[0].subject).toBe(`Kinga receipt ${formatReceiptNumber(receiptNumber!)}: KSh 30,000 received`);
    expect(sent[0].text).toContain("For: Kinga subscription, annual plan: 19 Oct 2026 to 19 Oct 2027");
    expect(sent[0].text).toContain("by card");
    expect(sent[0].text).toContain(`https://app.test/billing/receipts/${p.id}`);
  });

  it("emails confirmed owners if the payer's account has gone, and never throws", async () => {
    const [admin] = await db
      .insert(users)
      .values({ email: "admin@sunrise.ke", name: "Admin", passwordHash: "x", emailVerifiedAt: t0 })
      .returning({ id: users.id });
    await db.insert(memberships).values({ orgId, userId: admin.id, role: "admin" });
    const r = await startCheckout(db, fakePaystack(), {
      orgId,
      userId: admin.id,
      email: "admin@sunrise.ke",
      size: "micro_small",
      interval: "month",
      callbackUrl: "http://localhost:3000/billing/callback",
    });
    if ("error" in r) throw new Error(r.error);
    const [p] = await db.select().from(payments).where(eq(payments.reference, r.url.split("/").pop()!));
    await recordPayment(db, paid(p), t0);
    await db.delete(users).where(eq(users.id, admin.id));

    const sent: EmailMessage[] = [];
    await sendReceipt(db, async (m) => void sent.push(m), p.id);
    expect(sent.map((m) => m.to)).toEqual([["owner@sunrise.ke"]]);
    await expect(
      sendReceipt(db, async () => {
        throw new Error("SMTP down");
      }, p.id),
    ).resolves.toBeUndefined();
  });

  it("doesn't email a receipt for an unpaid checkout", async () => {
    const p = await checkout("month");
    const sent: EmailMessage[] = [];
    await sendReceipt(db, async (m) => void sent.push(m), p.id);
    expect(sent).toEqual([]);
  });

  it("formats the receipt email and the seller's details", async () => {
    const p = await checkout("month");
    await recordPayment(db, paid(p), t0);
    const m = receiptEmail(["a@b.ke"], await receipt(p.id), "https://x");
    expect(m.text).toContain("Amount: KSh 3,000 by mobile money");
    expect(m.text).toContain("for Sunrise Academy's records");

    expect(sellerFromEnv({} as NodeJS.ProcessEnv)).toEqual({ name: "Kinga", kraPin: null, address: null, email: null });
    expect(sellerFromEnv({ SELLER_NAME: "Kinga Ltd", SELLER_ADDRESS: "PO Box 1\\nNairobi" } as unknown as NodeJS.ProcessEnv).address).toBe("PO Box 1\nNairobi");
  });
});

describe("paystack", () => {
  it("checks webhook signatures", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "kinga-1" } });
    const sig = createHmac("sha512", "sk_test_x").update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig, "sk_test_x")).toBe(true);
    expect(verifyWebhookSignature(body, sig, "sk_test_y")).toBe(false);
    expect(verifyWebhookSignature(`${body} `, sig, "sk_test_x")).toBe(false);
    expect(verifyWebhookSignature(body, null, "sk_test_x")).toBe(false);
    expect(verifyWebhookSignature(body, "abc", "sk_test_x")).toBe(false);
    expect(verifyWebhookSignature(body, sig.toUpperCase(), "sk_test_x")).toBe(true);
    // Same length as a real signature, but a non-ASCII character makes it longer in bytes.
    expect(verifyWebhookSignature(body, `é${sig.slice(1)}`, "sk_test_x")).toBe(false);
    expect(verifyWebhookSignature(body, `${sig}zz`, "sk_test_x")).toBe(false);
    expect(verifyWebhookSignature(body, `${sig.slice(0, 127)}z`, "sk_test_x")).toBe(false);
  });

  it("reads transactions and calls the API with the secret key", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      const data = url.endsWith("/initialize")
        ? { authorization_url: "https://checkout.paystack.com/abc" }
        : { reference: "kinga-1", status: "success", amount: 300_000, currency: "KES", channel: "card", paid_at: "2026-10-05T09:00:00.000Z" };
      return new Response(JSON.stringify({ status: true, data }), { status: 200 });
    }) as typeof fetch;
    const paystack = createPaystack("sk_test_x", fetchImpl);

    expect(
      await paystack.initialize({ email: "a@b.ke", amount: 300_000, currency: "KES", reference: "kinga-1", callbackUrl: "cb", metadata: {} }),
    ).toEqual({ authorizationUrl: "https://checkout.paystack.com/abc" });
    expect(await paystack.verify("kinga-1")).toEqual({
      reference: "kinga-1",
      status: "success",
      amount: 300_000,
      currency: "KES",
      channel: "card",
      paidAt: t0,
    });
    expect(requests[0].url).toBe("https://api.paystack.co/transaction/initialize");
    expect(JSON.parse(String(requests[0].init.body))).toMatchObject({ callback_url: "cb", amount: 300_000 });
    expect(requests[1].url).toBe("https://api.paystack.co/transaction/verify/kinga-1");
    expect((requests[1].init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_x");
  });

  it("throws when Paystack refuses", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ status: false, message: "Invalid key" }), { status: 401 })) as unknown as typeof fetch;
    await expect(createPaystack("sk_bad", fetchImpl).verify("x")).rejects.toMatchObject({
      name: "PaystackError",
      status: 401,
      reason: "Invalid key",
      message: expect.stringMatching(/Invalid key/),
    });
  });

  it("tolerates missing fields", () => {
    expect(parseTransaction({ reference: "r", status: "failed", amount: 5, currency: "KES" })).toEqual({
      reference: "r",
      status: "failed",
      amount: 5,
      currency: "KES",
      channel: null,
      paidAt: null,
    });
  });
});

describe("billing emails", () => {
  const sent: EmailMessage[] = [];
  const send = async (m: EmailMessage) => {
    sent.push(m);
  };
  beforeEach(() => {
    sent.length = 0;
  });

  it("knows which email is due", () => {
    const trialEndsAt = later(14 * DAY);
    expect(dueBillingAlert({ trialEndsAt, paidUntil: null }, later(10 * DAY))).toBeNull();
    expect(dueBillingAlert({ trialEndsAt, paidUntil: null }, later(11 * DAY))).toBe("ending_soon");
    expect(dueBillingAlert({ trialEndsAt, paidUntil: null }, later(14 * DAY))).toBe("ended");
    expect(dueBillingAlert({ trialEndsAt, paidUntil: null }, later(28 * DAY))).toBe("ended");
    expect(dueBillingAlert({ trialEndsAt, paidUntil: null }, later(28 * DAY + 1))).toBeNull();
  });

  it("warns before the trial ends and once it has, each once", async () => {
    await runBillingAlerts(db, send, { now: later(5 * DAY) });
    expect(sent).toHaveLength(0);

    const r = await runBillingAlerts(db, send, { now: later(12 * DAY), appUrl: "https://kinga.test" });
    expect(r.sent).toEqual([{ orgId, kind: "ending_soon", to: ["owner@sunrise.ke"] }]);
    expect(sent[0].subject).toBe("Sunrise Academy: your Kinga free trial ends on 19 Oct 2026");
    expect(sent[0].text).toContain("https://kinga.test/billing");
    expect(sent[0].text).toContain("KSh 3,000 a month");
    await runBillingAlerts(db, send, { now: later(13 * DAY) });
    expect(sent).toHaveLength(1);

    await runBillingAlerts(db, send, { now: later(15 * DAY) });
    await runBillingAlerts(db, send, { now: later(16 * DAY) });
    expect(sent.map((m) => m.subject)).toEqual([
      "Sunrise Academy: your Kinga free trial ends on 19 Oct 2026",
      "Sunrise Academy: your Kinga free trial has ended",
    ]);
  });

  it("starts again for each paid period", async () => {
    await runBillingAlerts(db, send, { now: later(12 * DAY) });
    const p = await checkout("month");
    await recordPayment(db, paid(p), later(12 * DAY));
    await runBillingAlerts(db, send, { now: later(13 * DAY) });
    expect(sent).toHaveLength(1);

    const paidUntil = (await org()).paidUntil!;
    await runBillingAlerts(db, send, { now: new Date(paidUntil.getTime() - 2 * DAY) });
    expect(sent[1].subject).toMatch(/your Kinga subscription ends on/);
  });

  it("skips organisations that lapsed long ago, and retries failed sends", async () => {
    await runBillingAlerts(db, send, { now: later(40 * DAY) });
    expect(sent).toHaveLength(0);

    const failing = async () => {
      throw new Error("SMTP down");
    };
    const r = await runBillingAlerts(db, failing, { now: later(15 * DAY) });
    expect(r.failed).toHaveLength(1);
    await runBillingAlerts(db, send, { now: later(15 * DAY) });
    expect(sent).toHaveLength(1);
  });

  it("emails only confirmed owners", async () => {
    await db.update(users).set({ emailVerifiedAt: null }).where(eq(users.id, ownerId));
    const r = await runBillingAlerts(db, send, { now: later(12 * DAY) });
    expect(r.sent).toHaveLength(0);
  });
});
