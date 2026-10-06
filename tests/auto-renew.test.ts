import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { removeSavedCard, renewalReference, runAutoRenewals, setAutoRenew } from "@/lib/auto-renew";
import { dueBillingAlert, recordPayment, runBillingAlerts, startCheckout } from "@/lib/billing";
import type { EmailMessage } from "@/lib/email";
import { createPaystack, PaystackError, type Paystack, type PaystackTransaction } from "@/lib/paystack";
import { addPeriod, cardLabel, cardUsable, dueRenewalAttempt, TRIAL_DAYS } from "@/lib/plans";

const { billingAlertLog, memberships, organizations, payments, renewalAttempts, savedCards, users } = schema;

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const t0 = new Date("2026-10-05T09:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);
const trialEnd = later(TRIAL_DAYS * DAY);
/** Where access ends after the first (monthly) payment. */
const ends = addPeriod(trialEnd, "month");
const at = (ms: number) => new Date(ends.getTime() + ms);

let db: Db;
let orgId: string;
let ownerId: string;

const card = {
  code: "AUTH_abc123",
  reusable: true,
  channel: "card",
  brand: "visa",
  last4: "4242",
  expMonth: 12,
  expYear: 2030,
};

type Charge = Parameters<Paystack["chargeAuthorization"]>[0];
type ChargeReply = (Partial<PaystackTransaction> & { paused?: boolean; gatewayResponse?: string | null }) | Error;

function fakePaystack(replies: ChargeReply[] = [], verifies: (Partial<PaystackTransaction> | Error)[] = []) {
  const charges: Charge[] = [];
  const verified: string[] = [];
  const deactivated: string[] = [];
  const paystack: Paystack = {
    async initialize(p) {
      return { authorizationUrl: `https://checkout.paystack.com/${p.reference}` };
    },
    async verify(reference) {
      verified.push(reference);
      const r = verifies.shift() ?? { status: "success" };
      if (r instanceof Error) throw r;
      const [p] = await db.select().from(payments).where(eq(payments.reference, reference));
      return { reference, status: "success", amount: p.amount, currency: "KES", channel: "card", paidAt: null, ...r };
    },
    async chargeAuthorization(p) {
      charges.push(p);
      const r = replies.shift() ?? { status: "success" };
      if (r instanceof Error) throw r;
      return {
        reference: p.reference,
        status: "success",
        amount: p.amount,
        currency: p.currency,
        channel: "card",
        paidAt: null,
        paused: false,
        gatewayResponse: null,
        ...r,
      };
    },
    async deactivateAuthorization(code) {
      deactivated.push(code);
    },
  };
  return { paystack, charges, verified, deactivated };
}

/** Pays for a month at t0, as Paystack would report it. */
async function pay(opts: { saveCard?: boolean; channel?: string; authorization?: typeof card | null } = {}) {
  const { paystack } = fakePaystack();
  const r = await startCheckout(db, paystack, {
    orgId,
    userId: ownerId,
    email: "owner@sunrise.ke",
    size: "micro_small",
    item: { kind: "subscription", interval: "month", saveCard: opts.saveCard ?? true },
    callbackUrl: "http://localhost:3000/billing/callback",
  });
  if ("error" in r) throw new Error(r.error);
  const [p] = await db.select().from(payments).where(eq(payments.reference, r.url.split("/").pop()!));
  await recordPayment(
    db,
    {
      reference: p.reference,
      status: "success",
      amount: p.amount,
      currency: "KES",
      channel: opts.channel ?? "card",
      paidAt: t0,
      authorization: opts.authorization === undefined ? card : opts.authorization,
      customerEmail: "owner@sunrise.ke",
    },
    t0,
  );
  return p;
}

async function org() {
  const [o] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  return o;
}

function inbox() {
  const sent: EmailMessage[] = [];
  return { sent, send: async (m: EmailMessage) => void sent.push(m) };
}

beforeEach(async () => {
  const client = new PGlite();
  const pg = drizzle({ client, schema });
  await migrate(pg, { migrationsFolder: "drizzle" });
  db = pg as unknown as Db;

  const [o] = await db
    .insert(organizations)
    .values({ name: "Sunrise Academy", sector: "education", size: "micro_small", trialEndsAt: trialEnd })
    .returning({ id: organizations.id });
  orgId = o.id;
  const [u] = await db
    .insert(users)
    .values({ email: "owner@sunrise.ke", name: "Wanjiku", passwordHash: "x", emailVerifiedAt: t0 })
    .returning({ id: users.id });
  ownerId = u.id;
  await db.insert(memberships).values({ orgId, userId: ownerId, role: "owner" });
});

describe("saving a card", () => {
  it("saves a reusable card the payer agreed to save, and turns renewal on for the same interval", async () => {
    await pay();
    expect(await org()).toMatchObject({ autoRenewInterval: "month", paidUntil: ends });
    const [saved] = await db.select().from(savedCards).where(eq(savedCards.orgId, orgId));
    expect(saved).toMatchObject({
      authorizationCode: "AUTH_abc123",
      email: "owner@sunrise.ke",
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2030,
      savedBy: ownerId,
    });
  });

  it("needs consent, a card and Paystack saying it can be charged again", async () => {
    await pay({ saveCard: false });
    await pay({ channel: "mobile_money", authorization: { ...card, channel: "mobile_money" } });
    await pay({ authorization: { ...card, reusable: false } });
    await pay({ authorization: null });
    expect(await db.select().from(savedCards)).toEqual([]);
    expect((await org()).autoRenewInterval).toBeNull();
  });

  it("replaces the saved card when another is saved", async () => {
    await pay();
    await pay({ authorization: { ...card, code: "AUTH_new", last4: "1111" } });
    const saved = await db.select().from(savedCards);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ authorizationCode: "AUTH_new", last4: "1111" });
  });
});

describe("renewal schedule", () => {
  it("tries a day before the end, a day after and three days after, catching up with one charge", () => {
    expect(dueRenewalAttempt(ends, at(-25 * HOUR))).toBeNull();
    expect(dueRenewalAttempt(ends, at(-DAY))).toBe(1);
    expect(dueRenewalAttempt(ends, at(DAY - 1))).toBe(1);
    expect(dueRenewalAttempt(ends, at(DAY))).toBe(2);
    expect(dueRenewalAttempt(ends, at(3 * DAY))).toBe(3);
    expect(dueRenewalAttempt(ends, at(7 * DAY))).toBe(3);
    expect(dueRenewalAttempt(ends, at(7 * DAY + 1))).toBeNull();
  });

  it("treats a card as working to the end of its expiry month", () => {
    const c = { brand: "visa", last4: "4242", expMonth: 2, expYear: 2027 };
    expect(cardUsable(c, new Date("2027-02-28T23:59:59Z"))).toBe(true);
    expect(cardUsable(c, new Date("2027-03-01T00:00:00Z"))).toBe(false);
    expect(cardUsable({ ...c, expMonth: null }, new Date("2099-01-01"))).toBe(true);
    expect(cardLabel(c)).toBe("Visa ending 4242");
  });
});

describe("charging the saved card", () => {
  it("charges once as the period ends, extends access and emails a receipt", async () => {
    await pay();
    const { paystack, charges } = fakePaystack();
    const { sent, send } = inbox();

    expect((await runAutoRenewals(db, paystack, send, { now: at(-2 * DAY) })).checked).toBe(0);
    const r = await runAutoRenewals(db, paystack, send, { now: at(-12 * HOUR) });
    expect(r).toMatchObject({ checked: 1, declined: [], failed: [] });
    expect(r.renewed).toHaveLength(1);
    expect(charges).toEqual([
      {
        authorizationCode: "AUTH_abc123",
        email: "owner@sunrise.ke",
        amount: 300_000,
        currency: "KES",
        reference: renewalReference(orgId, ends, 1),
        metadata: { orgId, interval: "month", renewal: "1" },
      },
    ]);
    expect((await org()).paidUntil).toEqual(addPeriod(ends, "month"));
    expect(sent.map((m) => m.subject)).toEqual([expect.stringMatching(/^Kinga receipt R-000002/)]);

    // The next run, and one an hour later, have nothing to do.
    await runAutoRenewals(db, paystack, send, { now: at(-11 * HOUR) });
    await runAutoRenewals(db, paystack, send, { now: at(-10 * HOUR) });
    expect(charges).toHaveLength(1);
  });

  it("charges once when two jobs run at the same time", async () => {
    await pay();
    const { paystack, charges } = fakePaystack();
    const { send } = inbox();
    await Promise.all([
      runAutoRenewals(db, paystack, send, { now: at(-HOUR) }),
      runAutoRenewals(db, paystack, send, { now: at(-HOUR) }),
    ]);
    expect(charges).toHaveLength(1);
  });

  it("never reuses a reference, even if the claim is lost", async () => {
    await pay();
    const first = fakePaystack([{ status: "failed", gatewayResponse: "Insufficient Funds" }]);
    await runAutoRenewals(db, first.paystack, inbox().send, { now: at(-HOUR) });
    await db.delete(renewalAttempts);
    const again = fakePaystack();
    await runAutoRenewals(db, again.paystack, inbox().send, { now: at(-HOUR) });
    expect(again.charges).toEqual([]);
  });

  it("retries a declined card twice, then turns renewal off and says access has ended", async () => {
    await pay();
    const { paystack, charges } = fakePaystack([
      { status: "failed", gatewayResponse: "Insufficient Funds" },
      { status: "success", paused: true },
      { status: "failed", gatewayResponse: "Do Not Honor" },
    ]);
    const { sent, send } = inbox();

    const first = await runAutoRenewals(db, paystack, send, { now: at(-HOUR) });
    expect(first.declined).toEqual([{ orgId, attempt: 1, reason: "Insufficient Funds", renewalOff: false }]);
    expect(sent[0].subject).toBe("Sunrise Academy: we couldn't charge your card for Kinga");
    expect(sent[0].text).toContain("KSh 3,000 to the Visa ending 4242");
    expect(sent[0].text).toMatch(/We'll try again on/);
    // While renewal is pending, no "ended" email.
    expect((await runBillingAlerts(db, send, { now: at(HOUR) })).sent).toEqual([]);

    const second = await runAutoRenewals(db, paystack, send, { now: at(DAY) });
    expect(second.declined[0]).toMatchObject({ attempt: 2, reason: expect.stringMatching(/bank asked/), renewalOff: false });

    const third = await runAutoRenewals(db, paystack, send, { now: at(3 * DAY) });
    expect(third.declined[0]).toMatchObject({ attempt: 3, renewalOff: true });
    expect(sent.at(-1)!.subject).toBe("Sunrise Academy: your Kinga subscription has ended");
    expect(sent.at(-1)!.text).toMatch(/turned automatic renewal off/);

    expect(charges.map((c) => c.reference)).toEqual([1, 2, 3].map((n) => renewalReference(orgId, ends, n)));
    expect(await org()).toMatchObject({ autoRenewInterval: null, paidUntil: ends });
    expect(await db.select().from(savedCards)).toHaveLength(1);
    const failed = await db.select().from(payments).where(eq(payments.status, "failed"));
    expect(failed).toHaveLength(3);

    // The last failure email stood in for the "ended" one.
    const before = sent.length;
    await runBillingAlerts(db, send, { now: at(4 * DAY) });
    expect(sent).toHaveLength(before);
    await runAutoRenewals(db, paystack, send, { now: at(5 * DAY) });
    expect(charges).toHaveLength(3);
  });

  it("treats Paystack refusing the charge as a decline", async () => {
    await pay();
    const { paystack } = fakePaystack([new PaystackError("refused", 400, "Invalid authorization code")]);
    const r = await runAutoRenewals(db, paystack, inbox().send, { now: at(-HOUR) });
    expect(r.declined[0]).toMatchObject({ attempt: 1, reason: "Invalid authorization code" });
    expect(r.failed).toEqual([]);
  });

  it("treats a bad key or rate limiting as an error in the job, not a decline", async () => {
    await pay();
    const { paystack, charges } = fakePaystack(
      [new PaystackError("bad key", 401, "Invalid key")],
      [new PaystackError("not found", 400, "Transaction reference not found")],
    );
    const { sent, send } = inbox();
    const first = await runAutoRenewals(db, paystack, send, { now: at(-HOUR) });
    expect(first.declined).toEqual([]);
    expect(first.failed).toEqual([{ orgId, error: "bad key" }]);
    expect(sent).toEqual([]);
    expect((await org()).autoRenewInterval).toBe("month");

    // Once the key is fixed, the attempt Paystack never saw is made again.
    const second = await runAutoRenewals(db, paystack, send, { now: at(-HOUR / 2) });
    expect(second.renewed).toHaveLength(1);
    expect(charges.map((c) => c.reference)).toEqual([renewalReference(orgId, ends, 1), renewalReference(orgId, ends, 1)]);
  });

  it("doesn't take a charge another run has just made for a lost one", async () => {
    await pay();
    const { paystack, charges } = fakePaystack(
      [new Error("socket hang up")],
      [new PaystackError("not found", 400, "Transaction reference not found")],
    );
    await runAutoRenewals(db, paystack, inbox().send, { now: at(-HOUR) });
    const r = await runAutoRenewals(db, paystack, inbox().send, { now: at(-HOUR + 60_000) });
    expect(r.pending).toEqual([{ orgId, reference: renewalReference(orgId, ends, 1) }]);
    expect(charges).toHaveLength(1);
    const [p] = await db.select().from(payments).where(eq(payments.reference, renewalReference(orgId, ends, 1)));
    expect(p.status).toBe("pending");
  });

  it("doesn't charge a card that will have expired", async () => {
    await pay({ authorization: { ...card, expMonth: ends.getUTCMonth(), expYear: ends.getUTCFullYear() } });
    const { paystack, charges } = fakePaystack();
    await runAutoRenewals(db, paystack, inbox().send, { now: at(-HOUR) });
    expect(charges).toEqual([]);
  });

  it("checks a charge it never heard back about before charging again", async () => {
    await pay();
    const { paystack, charges, verified } = fakePaystack([new Error("socket hang up")], [{ status: "success", paidAt: at(-HOUR) }]);
    const { send } = inbox();

    const first = await runAutoRenewals(db, paystack, send, { now: at(-HOUR) });
    expect(first.failed).toEqual([{ orgId, error: "socket hang up" }]);
    const [pending] = await db.select().from(payments).where(eq(payments.reference, renewalReference(orgId, ends, 1)));
    expect(pending.status).toBe("pending");

    // It went through after all: credited on the next run, without a second charge.
    const second = await runAutoRenewals(db, paystack, send, { now: at(DAY) });
    expect(verified).toEqual([renewalReference(orgId, ends, 1)]);
    expect(second.renewed).toHaveLength(1);
    expect(charges).toHaveLength(1);
    expect((await org()).paidUntil).toEqual(addPeriod(ends, "month"));
  });

  it("charges again if Paystack never saw the lost charge", async () => {
    await pay();
    const { paystack, charges } = fakePaystack(
      [new Error("socket hang up")],
      [new PaystackError("not found", 400, "Transaction reference not found")],
    );
    await runAutoRenewals(db, paystack, inbox().send, { now: at(-HOUR) });
    const r = await runAutoRenewals(db, paystack, inbox().send, { now: at(-HOUR / 2) });
    expect(r.renewed).toHaveLength(1);
    expect(charges.map((c) => c.reference)).toEqual([renewalReference(orgId, ends, 1), renewalReference(orgId, ends, 1)]);
  });

  it("waits while a charge is still processing", async () => {
    await pay();
    const { paystack, charges } = fakePaystack([{ status: "pending" }], [{ status: "pending" }]);
    const first = await runAutoRenewals(db, paystack, inbox().send, { now: at(-HOUR) });
    expect(first.pending).toHaveLength(1);
    const second = await runAutoRenewals(db, paystack, inbox().send, { now: at(DAY) });
    expect(second.pending).toHaveLength(1);
    expect(charges).toHaveLength(1);
  });
});

describe("billing emails with renewal on", () => {
  it("announces the charge instead of asking for payment", async () => {
    await pay();
    expect(dueBillingAlert(await org(), at(-2 * DAY), true)).toBe("renewal_notice");
    expect(dueBillingAlert(await org(), at(DAY), true)).toBeNull();

    const { sent, send } = inbox();
    await runBillingAlerts(db, send, { now: at(-2 * DAY), appUrl: "https://kinga.test" });
    expect(sent[0].subject).toMatch(/^Sunrise Academy: your Kinga subscription renews on /);
    expect(sent[0].text).toContain("We'll charge KSh 3,000 to the Visa ending 4242 for another month");
    const log = await db.select().from(billingAlertLog);
    expect(log.map((l) => l.kind)).toEqual(["renewal_notice"]);
  });

  it("warns that an expiring card can't be charged", async () => {
    await pay({ authorization: { ...card, expMonth: ends.getUTCMonth(), expYear: ends.getUTCFullYear() } });
    const { sent, send } = inbox();
    await runBillingAlerts(db, send, { now: at(-2 * DAY) });
    expect(sent[0].subject).toMatch(/ends on/);
    expect(sent[0].text).toContain("the Visa ending 4242 expires before then");
  });
});

describe("changing renewal", () => {
  const by = { name: "Wanjiku", email: "owner@sunrise.ke" };

  it("switches interval quietly, and emails owners when it's turned off", async () => {
    await pay();
    const { sent, send } = inbox();
    expect(await setAutoRenew(db, send, orgId, "year", by, { now: t0 })).toEqual({ ok: true });
    expect((await org()).autoRenewInterval).toBe("year");
    expect(sent).toEqual([]);

    expect(await setAutoRenew(db, send, orgId, null, by, { now: t0 })).toEqual({ ok: true });
    expect((await org()).autoRenewInterval).toBeNull();
    expect(sent[0].subject).toBe("Sunrise Academy: Kinga won't renew automatically");
    expect(sent[0].text).toContain("Wanjiku (owner@sunrise.ke) turned automatic renewal off.");
  });

  it("can't turn renewal on without a card that will still work", async () => {
    const { send } = inbox();
    expect(await setAutoRenew(db, send, orgId, "month", by)).toMatchObject({ error: expect.stringMatching(/no saved card/) });
    await pay({ authorization: { ...card, expMonth: 1, expYear: 2026 } });
    await setAutoRenew(db, send, orgId, null, by, { now: t0 });
    expect(await setAutoRenew(db, send, orgId, "month", by, { now: t0 })).toMatchObject({ error: expect.stringMatching(/expires/) });
  });

  it("can't turn renewal back on once no charge is left for the ended period", async () => {
    await pay();
    const declines = Array.from({ length: 3 }, () => ({ status: "failed" as const, gatewayResponse: "Insufficient Funds" }));
    const { paystack } = fakePaystack(declines);
    const { send } = inbox();
    await runAutoRenewals(db, paystack, send, { now: at(-HOUR) });
    await runAutoRenewals(db, paystack, send, { now: at(DAY) });

    // Turned off and on between attempts: the last attempt is still to come.
    await setAutoRenew(db, send, orgId, null, by, { now: at(2 * DAY) });
    expect(await setAutoRenew(db, send, orgId, "month", by, { now: at(2 * DAY) })).toEqual({ ok: true });

    await runAutoRenewals(db, paystack, send, { now: at(3 * DAY) });
    expect((await org()).autoRenewInterval).toBeNull();
    expect(await setAutoRenew(db, send, orgId, "month", by, { now: at(4 * DAY) })).toMatchObject({
      error: expect.stringMatching(/can't be renewed automatically/),
    });
  });

  it("can't turn renewal on too long after the period ended", async () => {
    await pay();
    const { send } = inbox();
    await setAutoRenew(db, send, orgId, null, by, { now: t0 });
    expect(await setAutoRenew(db, send, orgId, "month", by, { now: at(8 * DAY) })).toMatchObject({
      error: expect.stringMatching(/can't be renewed automatically/),
    });
  });

  it("removes the card here and on Paystack, turning renewal off", async () => {
    await pay();
    const { paystack, deactivated } = fakePaystack();
    const { sent, send } = inbox();
    expect(await removeSavedCard(db, paystack, send, orgId, by, { now: t0 })).toEqual({ ok: true });
    expect(deactivated).toEqual(["AUTH_abc123"]);
    expect(await db.select().from(savedCards)).toEqual([]);
    expect((await org()).autoRenewInterval).toBeNull();
    expect(sent[0].text).toContain("removed the saved Visa ending 4242, which turns automatic renewal off");
    expect(await removeSavedCard(db, paystack, send, orgId, by)).toMatchObject({ error: expect.any(String) });
  });
});

describe("Paystack client", () => {
  it("reads the card and customer from a transaction, and charges and deactivates cards", async () => {
    const requests: { url: string; body: unknown }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      requests.push({ url, body: JSON.parse(String(init.body ?? "null")) });
      const data = url.endsWith("/deactivate_authorization")
        ? {}
        : {
            reference: "kinga-renew-1",
            status: "success",
            amount: 300_000,
            currency: "KES",
            channel: "card",
            paid_at: "2026-10-05T09:00:00.000Z",
            gateway_response: "Approved",
            customer: { email: "owner@sunrise.ke" },
            authorization: {
              authorization_code: "AUTH_abc123",
              reusable: true,
              channel: "card",
              brand: "visa",
              last4: "4242",
              exp_month: "12",
              exp_year: "2030",
            },
          };
      return new Response(JSON.stringify({ status: true, data }), { status: 200 });
    }) as typeof fetch;
    const paystack = createPaystack("sk_test_x", fetchImpl);

    const txn = await paystack.chargeAuthorization({
      authorizationCode: "AUTH_abc123",
      email: "owner@sunrise.ke",
      amount: 300_000,
      currency: "KES",
      reference: "kinga-renew-1",
      metadata: { orgId: "o" },
    });
    expect(txn).toMatchObject({ status: "success", paused: false, gatewayResponse: "Approved", customerEmail: "owner@sunrise.ke" });
    expect(txn.authorization).toEqual(card);
    expect(requests[0]).toEqual({
      url: "https://api.paystack.co/transaction/charge_authorization",
      body: {
        authorization_code: "AUTH_abc123",
        email: "owner@sunrise.ke",
        amount: 300_000,
        currency: "KES",
        reference: "kinga-renew-1",
        metadata: { orgId: "o" },
      },
    });

    await paystack.deactivateAuthorization("AUTH_abc123");
    expect(requests[1]).toEqual({
      url: "https://api.paystack.co/customer/deactivate_authorization",
      body: { authorization_code: "AUTH_abc123" },
    });
  });
});
