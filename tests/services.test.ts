import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { afterPaymentCredited } from "@/lib/after-payment";
import { PENDING_PAYMENT_KEEP_MS, prunePayments, receiptDescription, recordPayment, startCheckout } from "@/lib/billing";
import type { EmailMessage } from "@/lib/email";
import type { Paystack } from "@/lib/paystack";
import { TRIAL_DAYS } from "@/lib/plans";
import { sendServiceOrderNotice, serviceOrdersFor, setServiceOrderStatus } from "@/lib/service-orders";
import { SERVICES } from "@/lib/services";

const { memberships, organizations, payments, serviceOrders, users } = schema;

const DAY = 24 * 60 * 60 * 1000;
const t0 = new Date("2026-10-05T09:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);
const seller = { name: "Kinga", kraPin: null, address: null, email: "orders@kinga.test" };

let db: Db;
let orgId: string;
let ownerId: string;

const fakePaystack = (): Paystack & { calls: Parameters<Paystack["initialize"]>[0][] } => {
  const calls: Parameters<Paystack["initialize"]>[0][] = [];
  return {
    calls,
    async initialize(p) {
      calls.push(p);
      return { authorizationUrl: `https://checkout.paystack.com/${p.reference}` };
    },
    async verify() {
      throw new Error("not used");
    },
    async chargeAuthorization() {
      throw new Error("not used");
    },
    async deactivateAuthorization() {
      throw new Error("not used");
    },
    async refunds() {
      throw new Error("not used");
    },
  };
};

async function orderService(notes: string | null = "Our CCTV DPIA", paystack = fakePaystack()) {
  const r = await startCheckout(db, paystack, {
    orgId,
    userId: ownerId,
    email: "owner@sunrise.ke",
    size: "medium",
    item: { kind: "service", service: "dpia_review", notes },
    callbackUrl: "http://localhost:3000/billing/callback",
  });
  if ("error" in r) throw new Error(r.error);
  const [payment] = await db.select().from(payments).where(eq(payments.reference, r.url.split("/").pop()!));
  const [order] = await db.select().from(serviceOrders).where(eq(serviceOrders.paymentId, payment.id));
  return { payment, order };
}

const succeed = (p: { reference: string; amount: number }) =>
  recordPayment(db, { reference: p.reference, status: "success", amount: p.amount, currency: "KES", channel: "card", paidAt: t0 }, t0);

async function orderStatus(id: string) {
  const [o] = await db.select().from(serviceOrders).where(eq(serviceOrders.id, id));
  return o.status;
}

beforeEach(async () => {
  const client = new PGlite();
  const pg = drizzle({ client, schema });
  await migrate(pg, { migrationsFolder: "drizzle" });
  db = pg as unknown as Db;

  const [o] = await db
    .insert(organizations)
    .values({ name: "Sunrise Academy", sector: "education", size: "medium", kraPin: "P051234567X", trialEndsAt: later(TRIAL_DAYS * DAY) })
    .returning({ id: organizations.id });
  orgId = o.id;
  const [u] = await db
    .insert(users)
    .values({ email: "owner@sunrise.ke", name: "Wanjiku", passwordHash: "x", emailVerifiedAt: t0 })
    .returning({ id: users.id });
  ownerId = u.id;
  await db.insert(memberships).values({ orgId, userId: ownerId, role: "owner" });
});

describe("ordering a service", () => {
  it("records a pending service payment at the size's price, with an order awaiting payment", async () => {
    const paystack = fakePaystack();
    const { payment, order } = await orderService("Our CCTV DPIA", paystack);
    expect(payment).toMatchObject({ kind: "service", service: "dpia_review", interval: null, status: "pending" });
    expect(payment.amount).toBe(SERVICES.dpia_review.prices.medium * 100);
    expect(order).toMatchObject({ orgId, status: "awaiting_payment", notes: "Our CCTV DPIA", requestedBy: ownerId });
    expect(paystack.calls[0]).toMatchObject({ amount: payment.amount, metadata: { orgId, service: "dpia_review" } });
  });

  it("won't store a payment that is both or neither a subscription and a service", async () => {
    const base = { orgId, amount: 100, currency: "KES" };
    await expect(db.insert(payments).values({ ...base, reference: "a", kind: "service" })).rejects.toThrow();
    await expect(db.insert(payments).values({ ...base, reference: "b", kind: "subscription" })).rejects.toThrow();
    await expect(
      db.insert(payments).values({ ...base, reference: "c", kind: "subscription", interval: "month", service: "dpia_review" }),
    ).rejects.toThrow();
  });

  it("marks the order paid when the payment is credited, without touching the subscription", async () => {
    const { payment, order } = await orderService();
    const result = await succeed(payment);
    expect(result).toMatchObject({ result: "credited", kind: "service", periodEnd: null });

    const [o] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    expect(o.paidUntil).toBeNull();
    const [p] = await db.select().from(payments).where(eq(payments.id, payment.id));
    expect(p).toMatchObject({ status: "succeeded", billedName: "Sunrise Academy", billedKraPin: "P051234567X", periodStart: null });
    expect(p.receiptNumber).not.toBeNull();
    expect(await orderStatus(order.id)).toBe("paid");

    expect(await succeed(payment)).toMatchObject({ result: "already_credited" });
    expect(await orderStatus(order.id)).toBe("paid");
  });

  it("describes a service on its receipt", async () => {
    const { payment } = await orderService();
    expect(receiptDescription(payment)).toBe("Kinga expert DPIA review");
  });

  it("lists only paid orders", async () => {
    const { payment } = await orderService("first");
    await orderService("never paid");
    await succeed(payment);
    const orders = await serviceOrdersFor(db, orgId);
    expect(orders.map((o) => o.order.notes)).toEqual(["first"]);
  });

  it("drops unpaid checkouts and their orders", async () => {
    const { order } = await orderService();
    await prunePayments(db, new Date(Date.now() + PENDING_PAYMENT_KEEP_MS + DAY));
    expect(await db.select().from(serviceOrders).where(eq(serviceOrders.id, order.id))).toEqual([]);
  });
});

describe("order emails", () => {
  it("tells Kinga about a paid order and sends the payer a receipt", async () => {
    const { payment, order } = await orderService("Our CCTV DPIA");
    const result = await succeed(payment);
    if (result.result !== "credited") throw new Error("not credited");
    const sent: EmailMessage[] = [];
    process.env.SELLER_EMAIL = seller.email;
    try {
      await afterPaymentCredited(db, async (m) => void sent.push(m), result);
    } finally {
      delete process.env.SELLER_EMAIL;
    }
    expect(sent.map((m) => m.to)).toEqual([["owner@sunrise.ke"], [seller.email]]);
    expect(sent[1].subject).toBe("New order: Expert DPIA review for Sunrise Academy");
    expect(sent[1].text).toContain("Wanjiku <owner@sunrise.ke>");
    expect(sent[1].text).toContain("Our CCTV DPIA");
    expect(sent[1].text).toContain(order.id);
  });

  it("sends nothing without SELLER_EMAIL, or before the order is paid", async () => {
    const { payment } = await orderService();
    const sent: EmailMessage[] = [];
    await sendServiceOrderNotice(db, async (m) => void sent.push(m), payment.id, seller);
    await succeed(payment);
    await sendServiceOrderNotice(db, async (m) => void sent.push(m), payment.id, { ...seller, email: null });
    expect(sent).toEqual([]);
  });
});

describe("moving an order on", () => {
  it("goes from paid to in progress to delivered, emailing owners on delivery", async () => {
    const { payment, order } = await orderService();
    await succeed(payment);
    const sent: EmailMessage[] = [];
    const send = async (m: EmailMessage) => void sent.push(m);

    expect(await setServiceOrderStatus(db, send, order.id, "in_progress")).toEqual({ ok: true, emailed: [] });
    expect(sent).toEqual([]);
    const delivered = await setServiceOrderStatus(db, send, order.id, "delivered", { now: t0, appUrl: "https://app.test" });
    expect(delivered).toEqual({ ok: true, emailed: ["owner@sunrise.ke"] });
    expect(sent[0].subject).toBe("Sunrise Academy: your expert DPIA review is complete");
    expect(sent[0].text).toContain("https://app.test/services");
    const [o] = await db.select().from(serviceOrders).where(eq(serviceOrders.id, order.id));
    expect(o).toMatchObject({ status: "delivered", deliveredAt: t0 });
  });

  it("keeps the order delivered and says so when the delivery email fails", async () => {
    const { payment, order } = await orderService();
    await succeed(payment);
    const failing = async () => {
      throw new Error("SMTP down");
    };
    expect(await setServiceOrderStatus(db, failing, order.id, "delivered", { now: t0 })).toEqual({
      ok: true,
      emailed: [],
      emailError: "SMTP down",
    });
    expect(await orderStatus(order.id)).toBe("delivered");
  });

  it("refuses moves that make no sense", async () => {
    const send = async () => {};
    const { order: unpaid } = await orderService();
    expect(await setServiceOrderStatus(db, send, unpaid.id, "in_progress")).toMatchObject({ ok: false });

    const { payment, order } = await orderService();
    await succeed(payment);
    await setServiceOrderStatus(db, send, order.id, "cancelled");
    expect(await setServiceOrderStatus(db, send, order.id, "delivered")).toMatchObject({ ok: false });
    expect(await setServiceOrderStatus(db, send, "not-a-uuid", "delivered")).toEqual({ ok: false, error: "No order has that ID." });
  });
});
